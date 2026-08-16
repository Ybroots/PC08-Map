import type { Pool, PoolClient } from "pg";
import type {
  CitizenSessionRecord,
  CitizenSessionStore,
} from "./citizen-session.service";

interface CitizenSessionRow {
  session_id: string;
  token_hash: string;
  device_class: "mobile" | "web";
  created_at: Date;
  rotate_after: Date;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_session_id: string | null;
}

function mapRow(row: CitizenSessionRow): CitizenSessionRecord {
  return {
    sessionId: row.session_id,
    tokenHash: row.token_hash,
    deviceClass: row.device_class,
    createdAt: row.created_at,
    rotateAfter: row.rotate_after,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? undefined,
    replacedBySessionId: row.replaced_by_session_id ?? undefined,
  };
}

async function insert(
  client: Pool | PoolClient,
  record: CitizenSessionRecord,
): Promise<void> {
  await client.query(
    `INSERT INTO identity.citizen_sessions
       (session_id, token_hash, device_class, created_at, rotate_after, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      record.sessionId,
      record.tokenHash,
      record.deviceClass,
      record.createdAt,
      record.rotateAfter,
      record.expiresAt,
    ],
  );
}

export class PostgresCitizenSessionStore implements CitizenSessionStore {
  constructor(private readonly pool: Pool) {}

  async create(record: CitizenSessionRecord): Promise<void> {
    await insert(this.pool, record);
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<CitizenSessionRecord | null> {
    const result = await this.pool.query<CitizenSessionRow>(
      `SELECT session_id, token_hash, device_class, created_at, rotate_after,
              expires_at, revoked_at, replaced_by_session_id
       FROM identity.citizen_sessions
       WHERE token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async rotate(
    currentTokenHash: string,
    replacement: CitizenSessionRecord,
    now: Date,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE identity.citizen_sessions
         SET revoked_at = $2, replaced_by_session_id = $3
         WHERE token_hash = $1
           AND revoked_at IS NULL
           AND expires_at > $2`,
        [currentTokenHash, now, replacement.sessionId],
      );
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await insert(client, replacement);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
