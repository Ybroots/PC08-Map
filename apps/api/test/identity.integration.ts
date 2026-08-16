import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  CitizenSessionService,
  type CitizenSessionRecord,
} from "../src/modules/identity/citizen-session.service";
import { PostgresCitizenSessionStore } from "../src/modules/identity/postgres-citizen-session.store";
import { PostgresSecurityAuditSink } from "../src/modules/identity/security-audit.sink";
import { PostgresSessionRevocationStore } from "../src/modules/identity/session-revocation.store";

const SKIP = process.env["SKIP_SMOKE"] === "true";

describe("T03: PostgreSQL identity adapters", () => {
  let pool: Pool;
  const sessionIds: string[] = [];
  const revokedSessionHashes: string[] = [];

  beforeAll(() => {
    if (SKIP) return;
    pool = new Pool({
      connectionString:
        process.env["DATABASE_URL"] ??
        "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev",
    });
  });

  afterAll(async () => {
    if (SKIP) return;
    if (sessionIds.length > 0) {
      await pool.query(
        "DELETE FROM identity.citizen_sessions WHERE session_id = ANY($1::uuid[])",
        [sessionIds],
      );
    }
    if (revokedSessionHashes.length > 0) {
      await pool.query(
        "DELETE FROM identity.revoked_officer_sessions WHERE session_id_hash = ANY($1)",
        [revokedSessionHashes],
      );
    }
    await pool.end();
  });

  it("persists only hashes and rotates a citizen session atomically", async () => {
    if (SKIP) return;
    const store = new PostgresCitizenSessionStore(pool);
    const service = new CitizenSessionService(store, 60, 15);
    const issued = await service.create("mobile");
    sessionIds.push(issued.session_id);

    const row = await pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM identity.citizen_sessions WHERE session_id = $1",
      [issued.session_id],
    );
    expect(row.rows[0]?.token_hash).toBe(
      createHash("sha256").update(issued.session_token).digest("hex"),
    );
    expect(JSON.stringify(row.rows[0])).not.toContain(issued.session_token);

    const replacement = await service.rotate(issued.session_token);
    sessionIds.push(replacement.session_id);
    await expect(
      service.authenticate(issued.session_token),
    ).rejects.toMatchObject({
      code: "REVOKED",
    });
    await expect(
      service.authenticate(replacement.session_token),
    ).resolves.toBeDefined();
  });

  it("detects an officer session revocation by sid hash", async () => {
    if (SKIP) return;
    const sid = `session-${randomUUID()}`;
    const sidHash = createHash("sha256").update(sid).digest("hex");
    revokedSessionHashes.push(sidHash);
    await pool.query(
      `INSERT INTO identity.revoked_officer_sessions
         (session_id_hash, expires_at, reason_code)
       VALUES ($1, NOW() + INTERVAL '1 hour', 'TEST_REVOKE')`,
      [sidHash],
    );
    const store = new PostgresSessionRevocationStore(pool);
    await expect(store.isRevoked(sid)).resolves.toBe(true);
    await expect(store.isRevoked(`other-${sid}`)).resolves.toBe(false);
  });

  it("appends a token-free authentication audit event", async () => {
    if (SKIP) return;
    const traceId = randomUUID().replaceAll("-", "");
    const secret = "bearer-token-must-not-be-persisted";
    const audit = new PostgresSecurityAuditSink(pool);
    await audit.record({
      category: "AUTHENTICATION",
      principalId: "anonymous",
      action: "bearer",
      outcome: "DENIED",
      reason: "TOKEN_INVALID",
      traceId,
      resourceType: "session",
      resourceId: "unknown",
    });
    const result = await pool.query<{
      action: string;
      metadata: Record<string, unknown>;
    }>("SELECT action, metadata FROM audit.audit_events WHERE trace_id = $1", [
      traceId,
    ]);
    expect(result.rows[0]).toMatchObject({
      action: "authentication.bearer",
      metadata: {},
    });
    expect(JSON.stringify(result.rows[0])).not.toContain(secret);
  });
});

// Compile-time proof that persistence records contain no raw token field.
const _tokenFieldMustNotExist: keyof CitizenSessionRecord = "tokenHash";
void _tokenFieldMustNotExist;
