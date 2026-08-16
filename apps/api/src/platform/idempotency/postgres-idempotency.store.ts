import type { Pool } from "pg";
import type {
  ClaimResult,
  IdempotencyStore,
  StoredHttpResponse,
} from "./idempotency.types";

type QueryClient = Pick<Pool, "query">;

interface IdempotencyRow {
  request_hash: string;
  state: "PROCESSING" | "COMPLETED";
  response_status: number | null;
  response_body: StoredHttpResponse["body"] | null;
  expires_at: Date;
}

export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly database: QueryClient) {}

  async claim(
    key: string,
    requestHash: string,
    expiresAt: Date,
  ): Promise<ClaimResult> {
    const inserted = await this.database.query(
      `INSERT INTO platform.idempotency_keys
         (idempotency_key, request_hash, state, expires_at)
       VALUES ($1, $2, 'PROCESSING', $3)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [key, requestHash, expiresAt],
    );
    if (inserted.rowCount === 1) return { kind: "acquired" };

    const selected = await this.database.query<IdempotencyRow>(
      `SELECT request_hash, state, response_status, response_body, expires_at
       FROM platform.idempotency_keys
       WHERE idempotency_key = $1`,
      [key],
    );
    const row = selected.rows[0];
    if (!row) return this.claim(key, requestHash, expiresAt);

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      const removed = await this.database.query(
        `DELETE FROM platform.idempotency_keys
         WHERE idempotency_key = $1 AND expires_at <= NOW()`,
        [key],
      );
      return removed.rowCount === 1
        ? this.claim(key, requestHash, expiresAt)
        : { kind: "in_progress" };
    }
    if (row.request_hash !== requestHash) return { kind: "conflict" };
    if (row.state === "PROCESSING") return { kind: "in_progress" };
    if (row.response_status === null || row.response_body === null) {
      throw new Error("Completed idempotency record has no response");
    }
    return {
      kind: "replay",
      response: { status: row.response_status, body: row.response_body },
    };
  }

  async complete(
    key: string,
    requestHash: string,
    response: StoredHttpResponse,
  ): Promise<void> {
    const result = await this.database.query(
      `UPDATE platform.idempotency_keys
       SET state = 'COMPLETED', response_status = $3, response_body = $4, updated_at = NOW()
       WHERE idempotency_key = $1 AND request_hash = $2 AND state = 'PROCESSING'`,
      [key, requestHash, response.status, response.body],
    );
    if (result.rowCount !== 1)
      throw new Error("Cannot complete an unclaimed idempotency key");
  }

  async release(key: string, requestHash: string): Promise<void> {
    await this.database.query(
      `DELETE FROM platform.idempotency_keys
       WHERE idempotency_key = $1 AND request_hash = $2 AND state = 'PROCESSING'`,
      [key, requestHash],
    );
  }
}
