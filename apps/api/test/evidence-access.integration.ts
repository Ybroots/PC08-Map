import {
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createAccessScope, DataClass, OfficerRole } from "@atgt/authorization";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresEvidenceAccessRepository } from "../src/modules/evidence/evidence-access.repository";
import { EvidenceAccessService } from "../src/modules/evidence/evidence-access.service";
import { S3EvidenceStorageAdapter } from "../src/modules/evidence/s3-evidence-storage.adapter";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";
const ADMIN_DATABASE_URL =
  process.env["ADMIN_DATABASE_URL"] ??
  "postgresql://postgres:devpassword_local@localhost:5432/atgt_dev";
const S3_ENDPOINT = process.env["S3_ENDPOINT"] ?? "http://localhost:9000";
const S3_ACCESS_KEY = process.env["S3_ACCESS_KEY"] ?? "minio_dev";
const S3_SECRET_KEY = process.env["S3_SECRET_KEY"] ?? "devpassword_local";
const QUARANTINE = process.env["S3_BUCKET_QUARANTINE"] ?? "atgt-quarantine";
const ORIGINAL = process.env["S3_BUCKET_ORIGINAL"] ?? "atgt-evidence-original";
const DERIVATIVE =
  process.env["S3_BUCKET_DERIVATIVE"] ?? "atgt-evidence-derivative";

describe("T10B3 controlled evidence access", () => {
  let pool: Pool;
  let admin: Pool;
  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  const storage = new S3EvidenceStorageAdapter({
    endpoint: S3_ENDPOINT,
    region: "us-east-1",
    accessKey: S3_ACCESS_KEY,
    secretKey: S3_SECRET_KEY,
    bucketQuarantine: QUARANTINE,
    bucketOriginal: ORIGINAL,
    bucketDerivative: DERIVATIVE,
    forcePathStyle: true,
  });
  const evidenceIds: string[] = [];
  const objectKeys: Array<{ bucket: string; key: string }> = [];

  beforeAll(() => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
    admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 2 });
  });

  afterAll(async () => {
    if (SKIP) return;
    if (evidenceIds.length > 0) {
      await admin.query(
        "DELETE FROM audit.audit_events WHERE object_type='evidence' AND object_id=ANY($1::text[])",
        [evidenceIds],
      );
      await admin.query(
        "DELETE FROM evidence.objects WHERE evidence_id=ANY($1::uuid[])",
        [evidenceIds],
      );
      await admin.query(
        "DELETE FROM evidence.uploads WHERE upload_id=ANY($1::uuid[])",
        [evidenceIds],
      );
    }
    for (const item of objectKeys) {
      if (item.bucket === ORIGINAL) {
        const versions = await s3.send(
          new ListObjectVersionsCommand({
            Bucket: item.bucket,
            Prefix: item.key,
          }),
        );
        for (const entry of [
          ...(versions.Versions ?? []),
          ...(versions.DeleteMarkers ?? []),
        ]) {
          if (entry.Key === item.key && entry.VersionId) {
            await s3.send(
              new DeleteObjectCommand({
                Bucket: item.bucket,
                Key: item.key,
                VersionId: entry.VersionId,
              }),
            );
          }
        }
      } else {
        await s3.send(
          new DeleteObjectCommand({ Bucket: item.bucket, Key: item.key }),
        );
      }
    }
    await pool.end();
    await admin.end();
    s3.destroy();
  });

  it("issues readable scoped grants, audits access and rechecks actual data class", async () => {
    if (SKIP) return;
    const evidenceId = randomUUID();
    const caseId = randomUUID();
    const otherCaseId = randomUUID();
    const areaId = "uat-t10b3-area";
    const originalKey = `original/${evidenceId}`;
    const derivativeKey = `derivative/${evidenceId}.png`;
    const originalBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const derivativeBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    evidenceIds.push(evidenceId);
    objectKeys.push(
      { bucket: ORIGINAL, key: originalKey },
      { bucket: DERIVATIVE, key: derivativeKey },
    );
    await pool.query(
      `INSERT INTO evidence.uploads
         (upload_id,capability_hash,quarantine_object_key,declared_sha256,
          declared_mime,declared_size_bytes,state,observed_sha256,expires_at,
          finalized_at,processed_at)
       VALUES ($1,$2,$3,$4,'image/jpeg',$5,'READY',$4,
               clock_timestamp()+INTERVAL '5 minutes',clock_timestamp(),
               clock_timestamp())`,
      [
        evidenceId,
        "c".repeat(64),
        `quarantine/t10b3/${evidenceId}`,
        "a".repeat(64),
        originalBytes.length,
      ],
    );
    await pool.query(
      `INSERT INTO evidence.objects
         (evidence_id,owner_type,owner_id,area_id,original_object_key,
          derivative_object_key,sha256,mime,size_bytes,scan_engine,
          scan_engine_version)
       VALUES ($1,'incident',$2,$3,$4,$5,$6,'image/jpeg',$7,'fixture','1')`,
      [
        evidenceId,
        caseId,
        areaId,
        originalKey,
        derivativeKey,
        "a".repeat(64),
        originalBytes.length,
      ],
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: ORIGINAL,
        Key: originalKey,
        Body: originalBytes,
        ContentType: "image/jpeg",
      }),
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: DERIVATIVE,
        Key: derivativeKey,
        Body: derivativeBytes,
        ContentType: "image/png",
      }),
    );

    const repository = new PostgresEvidenceAccessRepository(pool);
    const service = new EvidenceAccessService(repository, storage, {
      enabled: true,
      allowedMimeTypes: ["image/jpeg", "image/png"],
      readUrlTtlSeconds: 120,
    });
    const dispatcher = createAccessScope({
      principalId: "dispatcher-t10b3",
      role: OfficerRole.DISPATCHER,
      areaIds: [areaId],
      assignedCaseIds: [caseId],
      maxDataClass: DataClass.SENSITIVE,
    });

    const preview = await service.issue(
      dispatcher,
      areaId,
      caseId,
      evidenceId,
      "PREVIEW",
      "a".repeat(32),
    );
    const previewResponse = await fetch(preview.access_url);
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await previewResponse.arrayBuffer())).toEqual(
      derivativeBytes,
    );

    const download = await service.issue(
      dispatcher,
      areaId,
      caseId,
      evidenceId,
      "DOWNLOAD",
      "b".repeat(32),
    );
    const downloadResponse = await fetch(download.access_url);
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-disposition")).toContain(
      "attachment",
    );
    expect(Buffer.from(await downloadResponse.arrayBuffer())).toEqual(
      originalBytes,
    );
    expect(JSON.stringify({ preview, download })).not.toMatch(
      /object_key|sha256|scan_engine/,
    );

    const wrongScope = createAccessScope({
      principalId: "dispatcher-wrong-case",
      role: OfficerRole.DISPATCHER,
      areaIds: [areaId],
      assignedCaseIds: [otherCaseId],
      maxDataClass: DataClass.SENSITIVE,
    });
    await expect(
      service.issue(
        wrongScope,
        areaId,
        caseId,
        evidenceId,
        "PREVIEW",
        "c".repeat(32),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await pool.query(
      "UPDATE evidence.objects SET data_class='restricted' WHERE evidence_id=$1",
      [evidenceId],
    );
    await expect(
      pool.query(
        "UPDATE evidence.objects SET data_class='sensitive' WHERE evidence_id=$1",
        [evidenceId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      service.issue(
        dispatcher,
        areaId,
        caseId,
        evidenceId,
        "DOWNLOAD",
        "d".repeat(32),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const audit = await pool.query<{
      outcome: string;
      action: string;
      metadata_text: string;
    }>(
      `SELECT outcome,action,metadata::text AS metadata_text
         FROM audit.audit_events
        WHERE object_type='evidence' AND object_id=$1
        ORDER BY happened_at,id`,
      [evidenceId],
    );
    expect(audit.rows.map((row) => [row.action, row.outcome])).toEqual([
      ["evidence.preview.issue", "SUCCESS"],
      ["evidence.download.issue", "SUCCESS"],
      ["evidence.preview.issue", "DENIED"],
      ["evidence.download.issue", "DENIED"],
    ]);
    expect(JSON.stringify(audit.rows)).not.toMatch(
      /signed|original\/|derivative\/|sha256/,
    );
  });
});
