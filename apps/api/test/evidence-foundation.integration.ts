import {
  EVENT_ROUTING_KEYS,
  type EvidenceScanRequestedEventData,
} from "@atgt/contracts";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { PostgresOutboxWriter } from "../src/platform/database/outbox-writer";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";

function traceId(): string {
  return randomBytes(16).toString("hex");
}

async function insertInitiated(
  client: PoolClient,
  evidenceId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO evidence.uploads
       (upload_id,capability_hash,quarantine_object_key,declared_sha256,
        declared_mime,declared_size_bytes,expires_at)
     VALUES ($1,$2,$3,$4,'image/jpeg',4096,NOW() + INTERVAL '5 minutes')`,
    [evidenceId, "b".repeat(64), `quarantine/${evidenceId}`, "a".repeat(64)],
  );
}

describe("T10A evidence foundation", () => {
  let pool: Pool;

  beforeAll(() => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  });

  afterAll(async () => {
    if (!SKIP) await pool.end();
  });

  it("creates chain-of-custody tables without citizen identity or delete grants", async () => {
    if (SKIP) return;
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema='evidence'
          AND table_name IN ('uploads','objects','scan_history')
        ORDER BY table_name`,
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "objects",
      "scan_history",
      "uploads",
    ]);
    const privileges = await pool.query<{
      can_delete_upload: boolean;
      can_delete_object: boolean;
      can_update_history: boolean;
    }>(
      `SELECT
         has_table_privilege(current_user,'evidence.uploads','DELETE') AS can_delete_upload,
         has_table_privilege(current_user,'evidence.objects','DELETE') AS can_delete_object,
         has_table_privilege(current_user,'evidence.scan_history','UPDATE') AS can_update_history`,
    );
    expect(privileges.rows[0]).toEqual({
      can_delete_upload: false,
      can_delete_object: false,
      can_update_history: false,
    });
    const forbidden = await pool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema='evidence'
          AND (
            column_name = ANY(ARRAY[
              'ip','ip_address','device_fingerprint','account_id','session_id',
              'session_token','citizen_id','identity_id','token'
            ])
            OR column_name LIKE '%fingerprint%'
            OR column_name LIKE '%session_token%'
          )`,
    );
    expect(forbidden.rows).toEqual([]);
  });

  it("finalizes scan pending state and outbox atomically without storage facts in the event", async () => {
    if (SKIP) return;
    const client = await pool.connect();
    const evidenceId = randomUUID();
    const eventId = randomUUID();
    const eventTraceId = traceId();
    try {
      await client.query("BEGIN");
      await insertInitiated(client, evidenceId);
      await client.query(
        `INSERT INTO evidence.scan_history
           (evidence_id,from_state,to_state,outcome_code,trace_id)
         VALUES ($1,NULL,'INITIATED','UPLOAD_INITIATED',$2)`,
        [evidenceId, eventTraceId],
      );
      await client.query(
        `UPDATE evidence.uploads
            SET state='SCAN_PENDING',observed_sha256=declared_sha256,
                finalized_at=NOW()
          WHERE upload_id=$1`,
        [evidenceId],
      );
      await client.query(
        `INSERT INTO evidence.scan_history
           (evidence_id,from_state,to_state,outcome_code,trace_id)
         VALUES ($1,'INITIATED','SCAN_PENDING','SCAN_REQUESTED',$2)`,
        [evidenceId, eventTraceId],
      );
      const data: EvidenceScanRequestedEventData = {
        evidence_id: evidenceId,
        state: "SCAN_PENDING",
      };
      await new PostgresOutboxWriter().append(client, {
        event_id: eventId,
        type: EVENT_ROUTING_KEYS.EVIDENCE_SCAN_REQUESTED,
        version: 1,
        occurred_at: new Date().toISOString(),
        trace_id: eventTraceId,
        aggregate_id: evidenceId,
        aggregate_type: "evidence",
        data,
      });
      const result = await client.query<{
        state: string;
        history_count: number;
        event_count: number;
        payload: Record<string, unknown>;
      }>(
        `SELECT u.state,
           (SELECT count(*)::int FROM evidence.scan_history h
             WHERE h.evidence_id=u.upload_id) AS history_count,
           (SELECT count(*)::int FROM platform.outbox o
             WHERE o.event_id=$2) AS event_count,
           (SELECT payload FROM platform.outbox o
             WHERE o.event_id=$2) AS payload
         FROM evidence.uploads u WHERE u.upload_id=$1`,
        [evidenceId, eventId],
      );
      expect(result.rows[0]).toMatchObject({
        state: "SCAN_PENDING",
        history_count: 2,
        event_count: 1,
        payload: data,
      });
      expect(JSON.stringify(result.rows[0]?.payload)).not.toMatch(
        /object_key|upload_url|sha256/,
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("rejects skipped lifecycle states and protects READY integrity", async () => {
    if (SKIP) return;
    const client = await pool.connect();
    const evidenceId = randomUUID();
    try {
      await client.query("BEGIN");
      await insertInitiated(client, evidenceId);
      await client.query("SAVEPOINT invalid_transition");
      await expect(
        client.query(
          `UPDATE evidence.uploads
              SET state='READY',observed_sha256=declared_sha256,
                  finalized_at=NOW(),processed_at=NOW()
            WHERE upload_id=$1`,
          [evidenceId],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await client.query("ROLLBACK TO SAVEPOINT invalid_transition");

      await client.query(
        `UPDATE evidence.uploads
            SET state='SCAN_PENDING',observed_sha256=declared_sha256,
                finalized_at=NOW()
          WHERE upload_id=$1`,
        [evidenceId],
      );
      await client.query(
        `UPDATE evidence.uploads
            SET state='READY',processed_at=NOW()
          WHERE upload_id=$1`,
        [evidenceId],
      );
      await client.query(
        `INSERT INTO evidence.objects
           (evidence_id,original_object_key,derivative_object_key,sha256,mime,
            size_bytes,scan_engine,scan_engine_version)
         VALUES ($1,$2,$3,$4,'image/jpeg',4096,'synthetic-av','test-v1')`,
        [
          evidenceId,
          `original/${evidenceId}`,
          `derivative/${evidenceId}`,
          "a".repeat(64),
        ],
      );
      await client.query("SAVEPOINT immutable_object");
      await expect(
        client.query(
          "UPDATE evidence.objects SET sha256=$2 WHERE evidence_id=$1",
          [evidenceId, "c".repeat(64)],
        ),
      ).rejects.toMatchObject({ code: expect.stringMatching(/42501|55000/) });
      await client.query("ROLLBACK TO SAVEPOINT immutable_object");
      const stored = await client.query<{
        state: string;
        sha256: string;
        retention_policy_version: string;
        legal_hold: boolean;
      }>(
        `SELECT u.state,o.sha256,o.retention_policy_version,o.legal_hold
           FROM evidence.uploads u
           JOIN evidence.objects o ON o.evidence_id=u.upload_id
          WHERE u.upload_id=$1`,
        [evidenceId],
      );
      expect(stored.rows[0]).toEqual({
        state: "READY",
        sha256: "a".repeat(64),
        retention_policy_version: "PENDING",
        legal_hold: false,
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
