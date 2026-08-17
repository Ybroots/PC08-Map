import { randomUUID } from "node:crypto";
import {
  EVENT_ROUTING_KEYS,
  type EvidenceScanRequestedEventData,
  type FinalizeEvidenceUpload,
  type InitiateEvidenceUpload,
} from "@atgt/contracts";
import type { PoolClient } from "pg";
import { PostgresOutboxWriter } from "../../platform/database";
import type {
  DatabaseTransactionManager,
  QueryExecutor,
} from "../../platform/database/database.types";
import { hashRequest } from "../../platform/idempotency/request-hash";
import {
  EvidenceFailure,
  type CreateEvidenceUploadProposal,
  type EvidenceRepositoryPort,
  type EvidenceUploadRecord,
} from "./evidence.types";

interface EvidenceUploadRow {
  upload_id: string;
  quarantine_object_key: string;
  declared_sha256: string;
  declared_mime: string;
  declared_size_bytes: string;
  state: EvidenceUploadRecord["state"];
  expires_at: Date;
  finalized_at: Date | null;
}

interface IdempotencyRow {
  request_hash: string;
  state: "PROCESSING" | "COMPLETED";
  response_body: unknown;
}

function mapUpload(row: EvidenceUploadRow): EvidenceUploadRecord {
  return {
    uploadId: row.upload_id,
    quarantineObjectKey: row.quarantine_object_key,
    declaredSha256: row.declared_sha256.trim(),
    declaredMime: row.declared_mime,
    declaredSizeBytes: Number(row.declared_size_bytes),
    state: row.state,
    expiresAt: new Date(row.expires_at),
    ...(row.finalized_at === null
      ? {}
      : { finalizedAt: new Date(row.finalized_at) }),
  };
}

function replayUploadId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const uploadId = (value as Record<string, unknown>)["upload_id"];
  return typeof uploadId === "string" ? uploadId : null;
}

const UPLOAD_COLUMNS = `upload_id,quarantine_object_key,declared_sha256,
  declared_mime,declared_size_bytes,state,expires_at,finalized_at`;

export class PostgresEvidenceRepository implements EvidenceRepositoryPort {
  constructor(
    private readonly pool: QueryExecutor,
    private readonly transactions: DatabaseTransactionManager,
    private readonly outbox: PostgresOutboxWriter,
  ) {}

  async createOrReplay(
    input: InitiateEvidenceUpload,
    proposal: CreateEvidenceUploadProposal,
    idempotencyKey: string,
    traceId: string,
    now: Date,
  ): Promise<EvidenceUploadRecord> {
    const storageKey = `evidence-initiate:${idempotencyKey}`;
    const requestHash = hashRequest(input);
    return this.transactions.execute(async (client) => {
      await client.query(
        `DELETE FROM platform.idempotency_keys
          WHERE idempotency_key=$1 AND expires_at <= $2`,
        [storageKey, now],
      );
      const claimed = await client.query(
        `INSERT INTO platform.idempotency_keys
           (idempotency_key,request_hash,state,expires_at)
         VALUES ($1,$2,'PROCESSING',$3)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [storageKey, requestHash, proposal.expiresAt],
      );
      if (claimed.rowCount !== 1) {
        return this.replay(client, storageKey, requestHash);
      }

      const inserted = await client.query<EvidenceUploadRow>(
        `INSERT INTO evidence.uploads
           (upload_id,capability_hash,quarantine_object_key,declared_sha256,
            declared_mime,declared_size_bytes,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING ${UPLOAD_COLUMNS}`,
        [
          proposal.uploadId,
          proposal.capabilityHash,
          proposal.quarantineObjectKey,
          input.declared_sha256,
          input.declared_mime,
          input.declared_size_bytes,
          proposal.expiresAt,
        ],
      );
      await client.query(
        `INSERT INTO evidence.scan_history
           (evidence_id,from_state,to_state,outcome_code,trace_id,created_at)
         VALUES ($1,NULL,'INITIATED','UPLOAD_INITIATED',$2,$3)`,
        [proposal.uploadId, traceId, now],
      );
      await client.query(
        `INSERT INTO audit.audit_events
           (who,action,object_type,object_id,outcome,trace_id,metadata)
         VALUES ('public','evidence.upload.initiate','evidence',$1,'SUCCESS',$2,$3::jsonb)`,
        [
          proposal.uploadId,
          traceId,
          JSON.stringify({
            declared_mime: input.declared_mime,
            declared_size_bytes: input.declared_size_bytes,
          }),
        ],
      );
      const completed = await client.query(
        `UPDATE platform.idempotency_keys
            SET state='COMPLETED',response_status=201,
                response_body=$3::jsonb,updated_at=$4
          WHERE idempotency_key=$1 AND request_hash=$2 AND state='PROCESSING'`,
        [
          storageKey,
          requestHash,
          JSON.stringify({ upload_id: proposal.uploadId }),
          now,
        ],
      );
      if (completed.rowCount !== 1) {
        throw new Error("Evidence idempotency completion invariant failed");
      }
      return mapUpload(inserted.rows[0]!);
    });
  }

  async getForFinalize(
    uploadId: string,
    capabilityHash: string,
  ): Promise<EvidenceUploadRecord | null> {
    const selected = await this.pool.query<EvidenceUploadRow>(
      `SELECT ${UPLOAD_COLUMNS}
         FROM evidence.uploads
        WHERE upload_id=$1 AND capability_hash=$2`,
      [uploadId, capabilityHash],
    );
    const row = selected.rows[0];
    return row ? mapUpload(row) : null;
  }

  async finalize(
    uploadId: string,
    capabilityHash: string,
    input: FinalizeEvidenceUpload,
    traceId: string,
    now: Date,
  ): Promise<Date> {
    return this.transactions.execute(async (client) => {
      const selected = await client.query<EvidenceUploadRow>(
        `SELECT ${UPLOAD_COLUMNS}
           FROM evidence.uploads
          WHERE upload_id=$1 AND capability_hash=$2
          FOR UPDATE`,
        [uploadId, capabilityHash],
      );
      const row = selected.rows[0];
      if (!row) throw new EvidenceFailure("NOT_FOUND");
      if (input.observed_sha256 !== row.declared_sha256.trim()) {
        throw new EvidenceFailure("HASH_MISMATCH");
      }
      if (row.state !== "INITIATED") {
        if (row.finalized_at) return new Date(row.finalized_at);
        throw new EvidenceFailure("STATE_CONFLICT");
      }
      if (new Date(row.expires_at) <= now) {
        throw new EvidenceFailure("EXPIRED");
      }

      const updated = await client.query<{ finalized_at: Date }>(
        `UPDATE evidence.uploads
            SET state='SCAN_PENDING',observed_sha256=$2,finalized_at=$3
          WHERE upload_id=$1 AND state='INITIATED'
          RETURNING finalized_at`,
        [uploadId, input.observed_sha256, now],
      );
      if (updated.rowCount !== 1) throw new EvidenceFailure("STATE_CONFLICT");
      await client.query(
        `INSERT INTO evidence.scan_history
           (evidence_id,from_state,to_state,outcome_code,trace_id,created_at)
         VALUES ($1,'INITIATED','SCAN_PENDING','SCAN_REQUESTED',$2,$3)`,
        [uploadId, traceId, now],
      );
      await client.query(
        `INSERT INTO audit.audit_events
           (who,action,object_type,object_id,outcome,trace_id,metadata)
         VALUES ('public','evidence.upload.finalize','evidence',$1,'SUCCESS',$2,$3::jsonb)`,
        [uploadId, traceId, JSON.stringify({ state: "SCAN_PENDING" })],
      );
      const data: EvidenceScanRequestedEventData = {
        evidence_id: uploadId,
        state: "SCAN_PENDING",
      };
      await this.outbox.append(client, {
        event_id: randomUUID(),
        type: EVENT_ROUTING_KEYS.EVIDENCE_SCAN_REQUESTED,
        version: 1,
        occurred_at: now.toISOString(),
        trace_id: traceId,
        aggregate_id: uploadId,
        aggregate_type: "evidence",
        data,
      });
      return new Date(updated.rows[0]!.finalized_at);
    });
  }

  private async replay(
    client: PoolClient,
    storageKey: string,
    requestHash: string,
  ): Promise<EvidenceUploadRecord> {
    const existing = await client.query<IdempotencyRow>(
      `SELECT request_hash,state,response_body
         FROM platform.idempotency_keys
        WHERE idempotency_key=$1`,
      [storageKey],
    );
    const row = existing.rows[0];
    if (!row || row.state === "PROCESSING") {
      throw new EvidenceFailure("IDEMPOTENCY_IN_PROGRESS");
    }
    if (row.request_hash !== requestHash) {
      throw new EvidenceFailure("IDEMPOTENCY_CONFLICT");
    }
    const uploadId = replayUploadId(row.response_body);
    if (!uploadId) throw new Error("Evidence idempotency response is invalid");
    const upload = await client.query<EvidenceUploadRow>(
      `SELECT ${UPLOAD_COLUMNS} FROM evidence.uploads WHERE upload_id=$1`,
      [uploadId],
    );
    if (!upload.rows[0])
      throw new Error("Evidence idempotency upload is missing");
    return mapUpload(upload.rows[0]);
  }
}
