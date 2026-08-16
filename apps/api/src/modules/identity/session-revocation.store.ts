import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { SessionRevocationStore } from "./identity.types";

function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

export class PostgresSessionRevocationStore implements SessionRevocationStore {
  constructor(private readonly pool: Pool) {}

  async isRevoked(sessionId: string): Promise<boolean> {
    const result = await this.pool.query<{ revoked: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM identity.revoked_officer_sessions
         WHERE session_id_hash = $1
           AND expires_at > NOW()
       ) AS revoked`,
      [hashSessionId(sessionId)],
    );
    return result.rows[0]?.revoked === true;
  }
}

export class InMemorySessionRevocationStore implements SessionRevocationStore {
  private readonly revoked = new Set<string>();

  revoke(sessionId: string): void {
    this.revoked.add(sessionId);
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    return this.revoked.has(sessionId);
  }
}
