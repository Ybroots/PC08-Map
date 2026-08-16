import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresIdempotencyStore } from "../src/platform/idempotency";

const SKIP = process.env["SKIP_SMOKE"] === "true";

describe("T02: PostgreSQL idempotency store", () => {
  let pool: Pool;
  const keys: string[] = [];

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
    if (keys.length > 0) {
      await pool.query(
        "DELETE FROM platform.idempotency_keys WHERE idempotency_key = ANY($1)",
        [keys],
      );
    }
    await pool.end();
  });

  it("claims, completes, and replays a stored response", async () => {
    if (SKIP) return;
    const store = new PostgresIdempotencyStore(pool);
    const key = randomUUID();
    keys.push(key);
    const expiresAt = new Date(Date.now() + 60_000);

    await expect(store.claim(key, "hash-a", expiresAt)).resolves.toEqual({
      kind: "acquired",
    });
    await expect(store.claim(key, "hash-a", expiresAt)).resolves.toEqual({
      kind: "in_progress",
    });
    await store.complete(key, "hash-a", {
      status: 202,
      body: { accepted: true },
    });
    await expect(store.claim(key, "hash-a", expiresAt)).resolves.toEqual({
      kind: "replay",
      response: { status: 202, body: { accepted: true } },
    });
    await expect(store.claim(key, "hash-b", expiresAt)).resolves.toEqual({
      kind: "conflict",
    });
  });
});
