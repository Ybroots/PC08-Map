import { randomUUID } from "node:crypto";
import {
  EVENT_ROUTING_KEYS,
  type EvidenceReadyEventData,
  type EvidenceScanRequestedEvent,
} from "@atgt/contracts";
import type { Pool, PoolClient } from "pg";
import type {
  EvidenceProcessingOutcome,
  EvidenceUploadWorkItem,
  EvidenceWorkCoordinatorPort,
  EvidenceWorkLease,
} from "./evidence-media.types";

interface UploadRow {
  upload_id: string;
  state: "SCAN_PENDING" | "READY" | "REJECTED";
  quarantine_object_key: string;
  declared_sha256: string;
  declared_mime: string;
  declared_size_bytes: string;
}

const CONSUMER_NAME = "evidence-media-worker";

function mapUpload(row: UploadRow): EvidenceUploadWorkItem {
  const size = Number(row.declared_size_bytes);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("INVALID_EVIDENCE_SIZE");
  }
  return {
    evidenceId: row.upload_id,
    state: row.state,
    quarantineObjectKey: row.quarantine_object_key,
    declaredSha256: row.declared_sha256.trim(),
    declaredMime: row.declared_mime,
    declaredSizeBytes: size,
  };
}

class PostgresEvidenceWorkLease implements EvidenceWorkLease {
  private released = false;

  constructor(
    private readonly client: PoolClient,
    private readonly evidenceId: string,
  ) {}

  async load(): Promise<EvidenceUploadWorkItem | null> {
    const result = await this.client.query<UploadRow>(
      `SELECT upload_id,state,quarantine_object_key,declared_sha256,
              declared_mime,declared_size_bytes
         FROM evidence.uploads WHERE upload_id=$1`,
      [this.evidenceId],
    );
    return result.rows[0] ? mapUpload(result.rows[0]) : null;
  }

  async complete(
    event: EvidenceScanRequestedEvent,
    outcome?: EvidenceProcessingOutcome,
  ): Promise<"PROCESSED" | "DUPLICATE"> {
    await this.client.query("BEGIN");
    try {
      const claimed = await this.client.query(
        `INSERT INTO platform.inbox_messages
           (consumer_name,message_id,event_type,trace_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (consumer_name,message_id) DO NOTHING
         RETURNING message_id`,
        [CONSUMER_NAME, event.event_id, event.type, event.trace_id],
      );
      if (claimed.rowCount !== 1) {
        await this.client.query("COMMIT");
        return "DUPLICATE";
      }

      const selected = await this.client.query<UploadRow>(
        `SELECT upload_id,state,quarantine_object_key,declared_sha256,
                declared_mime,declared_size_bytes
           FROM evidence.uploads WHERE upload_id=$1 FOR UPDATE`,
        [this.evidenceId],
      );
      const row = selected.rows[0];
      if (!row) throw new Error("EVIDENCE_UPLOAD_NOT_FOUND");
      const upload = mapUpload(row);
      if (upload.state !== "SCAN_PENDING") {
        await this.client.query("COMMIT");
        return "DUPLICATE";
      }
      if (!outcome) throw new Error("EVIDENCE_OUTCOME_REQUIRED");

      if (outcome.kind === "REJECTED") {
        await this.persistRejected(event, outcome);
      } else {
        if (
          outcome.sha256 !== upload.declaredSha256 ||
          outcome.mime !== upload.declaredMime ||
          outcome.sizeBytes !== upload.declaredSizeBytes
        ) {
          throw new Error("EVIDENCE_READY_FACT_MISMATCH");
        }
        await this.persistReady(event, outcome);
      }
      await this.client.query("COMMIT");
      return "PROCESSED";
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    try {
      await this.client.query(
        "SELECT pg_advisory_unlock(hashtext('atgt-evidence-media'),hashtext($1))",
        [this.evidenceId],
      );
    } finally {
      this.client.release();
    }
  }

  private async persistRejected(
    event: EvidenceScanRequestedEvent,
    outcome: Extract<EvidenceProcessingOutcome, { kind: "REJECTED" }>,
  ): Promise<void> {
    const updated = await this.client.query<{ processed_at: Date }>(
      `UPDATE evidence.uploads
          SET state='REJECTED',rejection_code=$2,processed_at=clock_timestamp()
        WHERE upload_id=$1 AND state='SCAN_PENDING'
        RETURNING processed_at`,
      [this.evidenceId, outcome.rejectionCode],
    );
    if (updated.rowCount !== 1) throw new Error("EVIDENCE_STATE_CONFLICT");
    await this.client.query(
      `INSERT INTO evidence.scan_history
         (evidence_id,from_state,to_state,outcome_code,scan_engine,
          scan_engine_version,trace_id,created_at)
       VALUES ($1,'SCAN_PENDING','REJECTED',$2,$3,$4,$5,$6)`,
      [
        this.evidenceId,
        outcome.rejectionCode,
        outcome.scanEngine,
        outcome.scanEngineVersion,
        event.trace_id,
        updated.rows[0]!.processed_at,
      ],
    );
    await this.client.query(
      `INSERT INTO audit.audit_events
         (who,action,object_type,object_id,outcome,reason,trace_id,metadata)
       VALUES ('system:evidence-media','evidence.scan.reject','evidence',$1,
               'SUCCESS',$2,$3,$4::jsonb)`,
      [
        this.evidenceId,
        outcome.rejectionCode,
        event.trace_id,
        JSON.stringify({ state: "REJECTED" }),
      ],
    );
  }

  private async persistReady(
    event: EvidenceScanRequestedEvent,
    outcome: Extract<EvidenceProcessingOutcome, { kind: "READY" }>,
  ): Promise<void> {
    const updated = await this.client.query<{ processed_at: Date }>(
      `UPDATE evidence.uploads
          SET state='READY',processed_at=clock_timestamp()
        WHERE upload_id=$1 AND state='SCAN_PENDING'
        RETURNING processed_at`,
      [this.evidenceId],
    );
    if (updated.rowCount !== 1) throw new Error("EVIDENCE_STATE_CONFLICT");
    await this.client.query(
      `INSERT INTO evidence.objects
         (evidence_id,original_object_key,derivative_object_key,sha256,mime,
          size_bytes,scan_engine,scan_engine_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        this.evidenceId,
        outcome.originalObjectKey,
        outcome.derivativeObjectKey,
        outcome.sha256,
        outcome.mime,
        outcome.sizeBytes,
        outcome.scanEngine,
        outcome.scanEngineVersion,
      ],
    );
    await this.client.query(
      `INSERT INTO evidence.scan_history
         (evidence_id,from_state,to_state,outcome_code,scan_engine,
          scan_engine_version,trace_id,created_at)
       VALUES ($1,'SCAN_PENDING','READY','SCAN_CLEAN',$2,$3,$4,$5)`,
      [
        this.evidenceId,
        outcome.scanEngine,
        outcome.scanEngineVersion,
        event.trace_id,
        updated.rows[0]!.processed_at,
      ],
    );
    await this.client.query(
      `INSERT INTO audit.audit_events
         (who,action,object_type,object_id,outcome,trace_id,metadata)
       VALUES ('system:evidence-media','evidence.scan.ready','evidence',$1,
               'SUCCESS',$2,$3::jsonb)`,
      [this.evidenceId, event.trace_id, JSON.stringify({ state: "READY" })],
    );
    const data: EvidenceReadyEventData = {
      evidence_id: this.evidenceId,
      state: "READY",
      mime: outcome.mime,
      size_bytes: outcome.sizeBytes,
    };
    await this.client.query(
      `INSERT INTO platform.outbox
         (event_id,aggregate_id,aggregate_type,event_type,payload,
          occurred_at,event_version,trace_id)
       VALUES ($1,$2,'evidence',$3,$4::jsonb,$5,1,$6)`,
      [
        randomUUID(),
        this.evidenceId,
        EVENT_ROUTING_KEYS.EVIDENCE_READY,
        JSON.stringify(data),
        updated.rows[0]!.processed_at,
        event.trace_id,
      ],
    );
  }
}

export class PostgresEvidenceWorkCoordinator implements EvidenceWorkCoordinatorPort {
  constructor(private readonly pool: Pool) {}

  async tryAcquire(evidenceId: string): Promise<EvidenceWorkLease | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_lock(
                  hashtext('atgt-evidence-media'),hashtext($1)
                ) AS acquired`,
        [evidenceId],
      );
      if (result.rows[0]?.acquired !== true) {
        client.release();
        return null;
      }
      return new PostgresEvidenceWorkLease(client, evidenceId);
    } catch (error) {
      client.release();
      throw error;
    }
  }
}
