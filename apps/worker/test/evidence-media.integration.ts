import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import {
  EVENT_ROUTING_KEYS,
  type EvidenceScanRequestedEvent,
} from "@atgt/contracts";
import { Pool } from "pg";
import sharp from "sharp";
import { EvidenceMediaProcessor } from "../src/evidence/evidence-media.processor";
import { FakeAntivirusAdapter } from "../src/evidence/fake-antivirus.adapter";
import { sha256 } from "../src/evidence/media-validation";
import { PostgresEvidenceWorkCoordinator } from "../src/evidence/postgres-evidence-work-coordinator";
import { S3EvidenceMediaStorageAdapter } from "../src/evidence/s3-evidence-media-storage.adapter";
import { SharpEvidenceDerivativeAdapter } from "../src/evidence/sharp-evidence-derivative.adapter";

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

function scanEvent(evidenceId: string): EvidenceScanRequestedEvent {
  return {
    event_id: randomUUID(),
    type: EVENT_ROUTING_KEYS.EVIDENCE_SCAN_REQUESTED,
    version: 1,
    occurred_at: new Date().toISOString(),
    trace_id: randomUUID().replaceAll("-", ""),
    aggregate_id: evidenceId,
    aggregate_type: "evidence",
    data: { evidence_id: evidenceId, state: "SCAN_PENDING" },
  };
}

describe("T10B2 evidence media worker", () => {
  let pool: Pool;
  let admin: Pool;
  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  const storage = new S3EvidenceMediaStorageAdapter({
    endpoint: S3_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    accessKey: S3_ACCESS_KEY,
    secretKey: S3_SECRET_KEY,
    bucketQuarantine: QUARANTINE,
    bucketOriginal: ORIGINAL,
    bucketDerivative: DERIVATIVE,
  });
  const evidenceIds: string[] = [];
  const eventIds: string[] = [];
  const objectKeys: Array<{ bucket: string; key: string }> = [];

  beforeAll(() => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
    admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 2 });
  });

  afterAll(async () => {
    if (SKIP) return;
    if (evidenceIds.length > 0) {
      if (eventIds.length > 0) {
        await admin.query(
          "DELETE FROM platform.inbox_messages WHERE consumer_name='evidence-media-worker' AND message_id = ANY($1::uuid[])",
          [eventIds],
        );
      }
      await admin.query(
        "DELETE FROM platform.outbox WHERE aggregate_id = ANY($1::text[])",
        [evidenceIds],
      );
      await admin.query(
        "DELETE FROM audit.audit_events WHERE object_type='evidence' AND object_id = ANY($1::text[])",
        [evidenceIds],
      );
      await admin.query(
        "DELETE FROM evidence.scan_history WHERE evidence_id = ANY($1::uuid[])",
        [evidenceIds],
      );
      await admin.query(
        "DELETE FROM evidence.objects WHERE evidence_id = ANY($1::uuid[])",
        [evidenceIds],
      );
      await admin.query(
        "DELETE FROM evidence.uploads WHERE upload_id = ANY($1::uuid[])",
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
        const objects = [
          ...(versions.Versions ?? []),
          ...(versions.DeleteMarkers ?? []),
        ]
          .filter((entry) => entry.Key === item.key && entry.VersionId)
          .map((entry) => ({ Key: item.key, VersionId: entry.VersionId }));
        for (const object of objects) {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: item.bucket,
              Key: object.Key,
              VersionId: object.VersionId,
            }),
          );
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

  async function seedPending(bytes: Buffer): Promise<{
    evidenceId: string;
    quarantineKey: string;
  }> {
    const evidenceId = randomUUID();
    const quarantineKey = `quarantine/t10b2/${evidenceId}`;
    evidenceIds.push(evidenceId);
    objectKeys.push({ bucket: QUARANTINE, key: quarantineKey });
    await pool.query(
      `INSERT INTO evidence.uploads
         (upload_id,capability_hash,quarantine_object_key,declared_sha256,
          declared_mime,declared_size_bytes,state,observed_sha256,expires_at,
          finalized_at)
       VALUES ($1,$2,$3,$4,'image/jpeg',$5,'SCAN_PENDING',$4,
               clock_timestamp()+INTERVAL '5 minutes',clock_timestamp())`,
      [evidenceId, "c".repeat(64), quarantineKey, sha256(bytes), bytes.length],
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: QUARANTINE,
        Key: quarantineKey,
        Body: bytes,
        ContentType: "image/jpeg",
      }),
    );
    return { evidenceId, quarantineKey };
  }

  it("creates one immutable original and an EXIF-free watermarked derivative", async () => {
    if (SKIP) return;
    const original = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: { r: 38, g: 92, b: 132 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(original).metadata()).orientation).toBe(6);
    const { evidenceId } = await seedPending(original);
    const originalKey = `original/${evidenceId}`;
    const derivativeKey = `derivative/${evidenceId}.png`;
    objectKeys.push(
      { bucket: ORIGINAL, key: originalKey },
      { bucket: DERIVATIVE, key: derivativeKey },
    );
    const event = scanEvent(evidenceId);
    eventIds.push(event.event_id);
    const processor = new EvidenceMediaProcessor(
      new PostgresEvidenceWorkCoordinator(pool),
      storage,
      new FakeAntivirusAdapter(),
      new SharpEvidenceDerivativeAdapter(),
      1024 * 1024,
    );

    await expect(processor.process(event)).resolves.toBe("PROCESSED");
    await expect(processor.process(event)).resolves.toBe("DUPLICATE");

    const state = await pool.query<{
      state: string;
      object_count: number;
      history_count: number;
      ready_event_count: number;
      inbox_count: number;
    }>(
      `SELECT u.state,
         (SELECT count(*)::int FROM evidence.objects o WHERE o.evidence_id=u.upload_id) object_count,
         (SELECT count(*)::int FROM evidence.scan_history h WHERE h.evidence_id=u.upload_id) history_count,
         (SELECT count(*)::int FROM platform.outbox x WHERE x.aggregate_id=u.upload_id::text AND x.event_type='evidence.ready.v1') ready_event_count,
         (SELECT count(*)::int FROM platform.inbox_messages i WHERE i.message_id=$2) inbox_count
       FROM evidence.uploads u WHERE u.upload_id=$1`,
      [evidenceId, event.event_id],
    );
    expect(state.rows[0]).toEqual({
      state: "READY",
      object_count: 1,
      history_count: 1,
      ready_event_count: 1,
      inbox_count: 1,
    });

    const storedOriginal = await s3.send(
      new GetObjectCommand({ Bucket: ORIGINAL, Key: originalKey }),
    );
    expect(
      Buffer.from(await storedOriginal.Body!.transformToByteArray()),
    ).toEqual(original);
    const storedDerivative = await s3.send(
      new GetObjectCommand({ Bucket: DERIVATIVE, Key: derivativeKey }),
    );
    const derivative = Buffer.from(
      await storedDerivative.Body!.transformToByteArray(),
    );
    const metadata = await sharp(derivative).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();

    await expect(
      storage.storeOriginalImmutable(originalKey, original, "image/jpeg"),
    ).resolves.toBeUndefined();
    await expect(
      storage.storeOriginalImmutable(
        originalKey,
        Buffer.alloc(original.length),
        "image/jpeg",
      ),
    ).rejects.toMatchObject({
      code: "IMMUTABLE_OBJECT_CONFLICT",
      retryable: false,
    });
    const versions = await s3.send(
      new ListObjectVersionsCommand({ Bucket: ORIGINAL, Prefix: originalKey }),
    );
    expect(
      versions.Versions?.filter((item) => item.Key === originalKey),
    ).toHaveLength(1);
  });

  it("rejects the EICAR fixture without creating readable objects", async () => {
    if (SKIP) return;
    const malware = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.from(
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
        "ascii",
      ),
    ]);
    const { evidenceId } = await seedPending(malware);
    const event = scanEvent(evidenceId);
    eventIds.push(event.event_id);
    const processor = new EvidenceMediaProcessor(
      new PostgresEvidenceWorkCoordinator(pool),
      storage,
      new FakeAntivirusAdapter(),
      new SharpEvidenceDerivativeAdapter(),
      1024 * 1024,
    );
    await expect(processor.process(event)).resolves.toBe("PROCESSED");
    const result = await pool.query<{
      state: string;
      rejection_code: string;
      object_count: number;
      outcome_code: string;
    }>(
      `SELECT u.state,u.rejection_code,
         (SELECT count(*)::int FROM evidence.objects o WHERE o.evidence_id=u.upload_id) object_count,
         (SELECT outcome_code FROM evidence.scan_history h WHERE h.evidence_id=u.upload_id) outcome_code
       FROM evidence.uploads u WHERE u.upload_id=$1`,
      [evidenceId],
    );
    expect(result.rows[0]).toEqual({
      state: "REJECTED",
      rejection_code: "MALWARE_DETECTED",
      object_count: 0,
      outcome_code: "MALWARE_DETECTED",
    });
  });
});
