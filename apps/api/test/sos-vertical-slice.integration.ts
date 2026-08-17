import { randomUUID } from "node:crypto";
import { createAccessScope, DataClass, OfficerRole } from "@atgt/authorization";
import type { CreateSosDto } from "@atgt/contracts";
import { Pool } from "pg";
import {
  IncidentFailure,
  PostgresIncidentRepository,
} from "../src/modules/incidents/incident.repository";
import { PostgresOutboxWriter } from "../src/platform/database/outbox-writer";
import { PostgresTransactionManager } from "../src/platform/database/transaction-manager";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";
const ADMIN_DATABASE_URL =
  process.env["ADMIN_DATABASE_URL"] ??
  "postgresql://postgres:devpassword_local@localhost:5432/atgt_dev";

describe("T07 SOS vertical slice", () => {
  let pool: Pool;
  let admin: Pool;
  let incidents: PostgresIncidentRepository;
  const areaId = `test-t07-${randomUUID()}`;
  const traceId = randomUUID().replaceAll("-", "");
  const keys: string[] = [];

  const payload = (overrides: Partial<CreateSosDto> = {}): CreateSosDto => ({
    coordinateLongitude: 108.4384,
    coordinateLatitude: 11.9404,
    accuracyMeters: 8.5,
    incidentType: "TRAFFIC_ACCIDENT",
    description: "Synthetic SOS integration fixture",
    clientEventAt: "2026-08-17T04:00:00.000Z",
    ...overrides,
  });

  beforeAll(() => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL, max: 12 });
    admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    incidents = new PostgresIncidentRepository(
      pool,
      new PostgresTransactionManager(pool),
      new PostgresOutboxWriter(),
      { enabled: true, intakeAreaId: areaId, idempotencyTtlMinutes: 60 },
    );
  });

  afterAll(async () => {
    if (SKIP) return;
    const ids = await admin.query<{ id: string }>(
      "SELECT id FROM incident.incidents WHERE area_id=$1",
      [areaId],
    );
    const incidentIds = ids.rows.map((row) => row.id);
    if (incidentIds.length > 0) {
      await admin.query(
        "DELETE FROM platform.outbox WHERE aggregate_id=ANY($1::text[])",
        [incidentIds],
      );
      await admin.query(
        "DELETE FROM audit.audit_events WHERE object_id=ANY($1::text[])",
        [incidentIds],
      );
      await admin.query(
        "DELETE FROM incident.status_history WHERE incident_id=ANY($1::uuid[])",
        [incidentIds],
      );
      await admin.query(
        "DELETE FROM incident.incidents WHERE id=ANY($1::uuid[])",
        [incidentIds],
      );
    }
    if (keys.length > 0) {
      await admin.query(
        "DELETE FROM platform.idempotency_keys WHERE idempotency_key=ANY($1::text[])",
        [keys.map((key) => `sos:${key}`)],
      );
    }
    await pool.end();
    await admin.end();
  });

  it("atomically persists incident, history, audit, outbox and the replay response", async () => {
    if (SKIP) return;
    const key = randomUUID();
    keys.push(key);
    const accepted = await incidents.acceptSos(payload(), key, traceId);
    expect(accepted.replayed).toBe(false);
    expect(accepted.response).toMatchObject({ status: "RECEIVED" });

    const stored = await pool.query<{
      incidents: number;
      history: number;
      audit: number;
      outbox: number;
      idempotency: number;
      payload: Record<string, unknown>;
    }>(
      `SELECT
         (SELECT count(*)::int FROM incident.incidents WHERE public_code=$1) incidents,
         (SELECT count(*)::int FROM incident.status_history h JOIN incident.incidents i ON i.id=h.incident_id WHERE i.public_code=$1) history,
         (SELECT count(*)::int FROM audit.audit_events WHERE action='incident.sos.accept' AND object_id=(SELECT id::text FROM incident.incidents WHERE public_code=$1)) audit,
         (SELECT count(*)::int FROM platform.outbox WHERE event_type='incident.received.v1' AND aggregate_id=(SELECT id::text FROM incident.incidents WHERE public_code=$1)) outbox,
         (SELECT count(*)::int FROM platform.idempotency_keys WHERE idempotency_key=$2 AND state='COMPLETED') idempotency,
         (SELECT payload FROM platform.outbox WHERE event_type='incident.received.v1' AND aggregate_id=(SELECT id::text FROM incident.incidents WHERE public_code=$1) LIMIT 1) payload`,
      [accepted.response.publicCode, `sos:${key}`],
    );
    expect(stored.rows[0]).toMatchObject({
      incidents: 1,
      history: 1,
      audit: 1,
      outbox: 1,
      idempotency: 1,
    });
    expect(stored.rows[0]?.payload).not.toHaveProperty("public_code");
    expect(stored.rows[0]?.payload).not.toHaveProperty("longitude");
  });

  it("replays the exact response and rejects key reuse with another payload", async () => {
    if (SKIP) return;
    const key = randomUUID();
    keys.push(key);
    const first = await incidents.acceptSos(payload(), key, traceId);
    const replay = await incidents.acceptSos(payload(), key, traceId);
    expect(replay).toEqual({ response: first.response, replayed: true });
    await expect(
      incidents.acceptSos(
        payload({ coordinateLongitude: 108.45 }),
        key,
        traceId,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<IncidentFailure>>({
        code: "IDEMPOTENCY_CONFLICT",
      }),
    );
  });

  it("serializes concurrent retries into one incident and one stable acknowledgement", async () => {
    if (SKIP) return;
    const key = randomUUID();
    keys.push(key);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        incidents.acceptSos(payload(), key, traceId),
      ),
    );
    expect(new Set(results.map((item) => item.response.publicCode)).size).toBe(
      1,
    );
    expect(results.filter((item) => !item.replayed)).toHaveLength(1);
    const count = await pool.query<{ count: number }>(
      "SELECT count(*)::int count FROM incident.incidents WHERE public_code=$1",
      [results[0]!.response.publicCode],
    );
    expect(count.rows[0]?.count).toBe(1);
  });

  it("shows accepted SOS in a resumable scoped feed and denies another area", async () => {
    if (SKIP) return;
    const key = randomUUID();
    keys.push(key);
    const accepted = await incidents.acceptSos(payload(), key, traceId);
    const scope = createAccessScope({
      principalId: "dispatcher-t07",
      role: OfficerRole.DISPATCHER,
      areaIds: [areaId],
      maxDataClass: DataClass.SENSITIVE,
      authenticationMethods: ["pwd", "mfa"],
    });
    const first = await incidents.feed(scope, areaId, {
      after: "0",
      limit: 100,
    });
    const item = first.items.find(
      (candidate) =>
        candidate.incident.publicCode === accepted.response.publicCode,
    );
    expect(item).toMatchObject({
      fromState: null,
      toState: "RECEIVED",
    });
    const resumed = await incidents.feed(scope, areaId, {
      after: item!.cursor,
      limit: 100,
    });
    expect(
      resumed.items.some(
        (candidate) =>
          candidate.incident.publicCode === accepted.response.publicCode,
      ),
    ).toBe(false);
    await expect(
      incidents.feed(
        createAccessScope({
          principalId: "cross-area",
          role: OfficerRole.DISPATCHER,
          areaIds: ["another-area"],
          maxDataClass: DataClass.SENSITIVE,
        }),
        areaId,
        { after: "0", limit: 10 },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("uses the same not-found class for malformed and unknown tracking codes", async () => {
    if (SKIP) return;
    await expect(incidents.publicTracking("not-a-code")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      incidents.publicTracking("000000000000"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a direct unauthorized state jump without changing history", async () => {
    if (SKIP) return;
    const key = randomUUID();
    keys.push(key);
    const accepted = await incidents.acceptSos(payload(), key, traceId);
    const row = await pool.query<{ id: string }>(
      "SELECT id FROM incident.incidents WHERE public_code=$1",
      [accepted.response.publicCode],
    );
    const scope = createAccessScope({
      principalId: "dispatcher-t07",
      role: OfficerRole.DISPATCHER,
      areaIds: [areaId],
      maxDataClass: DataClass.SENSITIVE,
    });
    await expect(
      incidents.transition(
        row.rows[0]!.id,
        areaId,
        scope,
        { toState: "CLOSED", expectedVersion: 1 },
        traceId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const count = await pool.query<{ count: number }>(
      "SELECT count(*)::int count FROM incident.status_history WHERE incident_id=$1",
      [row.rows[0]!.id],
    );
    expect(count.rows[0]?.count).toBe(1);
  });

  it("fails closed before opening a transaction when intake policy is absent", async () => {
    if (SKIP) return;
    const blocked = new PostgresIncidentRepository(
      pool,
      new PostgresTransactionManager(pool),
      new PostgresOutboxWriter(),
      { enabled: false },
    );
    await expect(
      blocked.acceptSos(payload(), randomUUID(), traceId),
    ).rejects.toMatchObject({ code: "CONFIGURATION_BLOCKED" });
  });
});
