import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { PostgresOutboxWriter } from "../src/platform/database";
import type { DatabaseTransactionManager } from "../src/platform/database/database.types";
import { PostgresEvidenceRepository } from "../src/modules/evidence/evidence.repository";
import { EvidenceService } from "../src/modules/evidence/evidence.service";
import { EvidenceFailure } from "../src/modules/evidence/evidence.types";
import { S3EvidenceStorageAdapter } from "../src/modules/evidence/s3-evidence-storage.adapter";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";
const S3_ENDPOINT = process.env["S3_ENDPOINT"] ?? "http://localhost:9000";
const S3_ACCESS_KEY = process.env["S3_ACCESS_KEY"] ?? "minio_dev";
const S3_SECRET_KEY = process.env["S3_SECRET_KEY"] ?? "devpassword_local";
const BUCKET = process.env["S3_BUCKET_QUARANTINE"] ?? "atgt-quarantine";

class ClientBoundTransactions implements DatabaseTransactionManager {
  constructor(private readonly client: PoolClient) {}

  execute<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return work(this.client);
  }
}

describe("T10B1 evidence initiate/finalize runtime", () => {
  let pool: Pool;
  const s3Config = {
    endpoint: S3_ENDPOINT,
    region: "us-east-1",
    accessKey: S3_ACCESS_KEY,
    secretKey: S3_SECRET_KEY,
    bucketQuarantine: BUCKET,
    forcePathStyle: true,
  };
  const cleanupClient = new S3Client({
    endpoint: S3_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_KEY,
    },
  });

  beforeAll(() => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  });

  afterAll(async () => {
    if (!SKIP) {
      await pool.end();
      cleanupClient.destroy();
    }
  });

  it("puts only into quarantine and atomically emits one scan request", async () => {
    if (SKIP) return;
    const client = await pool.connect();
    let sequence = 101;
    const nextId = () =>
      `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
    const objectKey =
      "quarantine/00000000-0000-4000-8000-000000000102/00000000-0000-4000-8000-000000000103";
    const body = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const now = new Date();
    try {
      await client.query("BEGIN");
      const repository = new PostgresEvidenceRepository(
        client,
        new ClientBoundTransactions(client),
        new PostgresOutboxWriter(),
      );
      const service = new EvidenceService(
        repository,
        new S3EvidenceStorageAdapter(s3Config),
        {
          enabled: true,
          allowedMimeTypes: ["image/jpeg"],
          maxBytes: 8,
          uploadUrlTtlSeconds: 300,
          capabilitySecret: "local-test-capability-secret-32-characters",
        },
        () => new Date(now),
        nextId,
      );
      const initiated = await service.initiate(
        {
          declared_mime: "image/jpeg",
          declared_size_bytes: body.length,
          declared_sha256: sha256,
        },
        "123e4567-e89b-42d3-a456-426614174101",
        "a".repeat(32),
      );
      const replayedInitiation = await service.initiate(
        {
          declared_mime: "image/jpeg",
          declared_size_bytes: body.length,
          declared_sha256: sha256,
        },
        "123e4567-e89b-42d3-a456-426614174101",
        "a".repeat(32),
      );
      expect(replayedInitiation.upload_id).toBe(initiated.upload_id);
      expect(replayedInitiation.upload_capability).toBe(
        initiated.upload_capability,
      );
      await expect(
        service.initiate(
          {
            declared_mime: "image/jpeg",
            declared_size_bytes: body.length + 1,
            declared_sha256: sha256,
          },
          "123e4567-e89b-42d3-a456-426614174101",
          "a".repeat(32),
        ),
      ).rejects.toEqual(new EvidenceFailure("IDEMPOTENCY_CONFLICT"));
      const upload = await fetch(initiated.upload_url, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body,
      });
      expect(upload.status).toBe(200);

      const finalized = await service.finalize(
        initiated.upload_id,
        initiated.upload_capability,
        { observed_sha256: sha256 },
        "b".repeat(32),
      );
      const replay = await service.finalize(
        initiated.upload_id,
        initiated.upload_capability,
        { observed_sha256: sha256 },
        "c".repeat(32),
      );
      expect(replay).toEqual(finalized);

      const stored = await client.query<{
        state: string;
        object_key: string;
        capability_hash: string;
        event_count: number;
        history_count: number;
        idempotency_body: Record<string, unknown>;
      }>(
        `SELECT u.state,u.quarantine_object_key AS object_key,
                u.capability_hash,
           (SELECT count(*)::int FROM platform.outbox o
             WHERE o.aggregate_id=u.upload_id::text
               AND o.event_type='evidence.scan_requested.v1') AS event_count,
           (SELECT count(*)::int FROM evidence.scan_history h
             WHERE h.evidence_id=u.upload_id) AS history_count,
           (SELECT response_body FROM platform.idempotency_keys k
             WHERE k.idempotency_key=$2) AS idempotency_body
          FROM evidence.uploads u WHERE u.upload_id=$1`,
        [
          initiated.upload_id,
          "evidence-initiate:123e4567-e89b-42d3-a456-426614174101",
        ],
      );
      expect(stored.rows[0]).toMatchObject({
        state: "SCAN_PENDING",
        object_key: objectKey,
        event_count: 1,
        history_count: 2,
        idempotency_body: { upload_id: initiated.upload_id },
      });
      expect(stored.rows[0]?.capability_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored.rows[0]?.idempotency_body)).not.toMatch(
        /capability|upload_url|object_key/,
      );
      const event = await client.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM platform.outbox
          WHERE aggregate_id=$1 AND event_type='evidence.scan_requested.v1'`,
        [initiated.upload_id],
      );
      expect(event.rows[0]?.payload).toEqual({
        evidence_id: initiated.upload_id,
        state: "SCAN_PENDING",
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await cleanupClient.send(
        new DeleteObjectCommand({ Bucket: BUCKET, Key: objectKey }),
      );
    }
  });
});
