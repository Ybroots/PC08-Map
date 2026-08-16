import { createAccessScope, DataClass, OfficerRole } from "@atgt/authorization";
import { EVENT_ROUTING_KEYS, type EventEnvelope } from "@atgt/contracts";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { PostgresIncidentReadRepository } from "../src/modules/incidents/postgres-incident-read.repository";
import { PostgresInboxStore } from "../src/platform/database/inbox-store";
import { PostgresOutboxWriter } from "../src/platform/database/outbox-writer";
import { PostgresTransactionManager } from "../src/platform/database/transaction-manager";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";
const PUBLIC_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function publicCode(): string {
  return [...randomBytes(12)]
    .map((byte) => PUBLIC_CODE_ALPHABET[byte % PUBLIC_CODE_ALPHABET.length])
    .join("");
}

function traceId(): string {
  return randomBytes(16).toString("hex");
}

function eventFor(incidentId: string): EventEnvelope {
  return {
    event_id: randomUUID(),
    type: EVENT_ROUTING_KEYS.INCIDENT_RECEIVED,
    version: 1,
    occurred_at: new Date().toISOString(),
    trace_id: traceId(),
    aggregate_id: incidentId,
    aggregate_type: "incident",
    data: { state: "RECEIVED" },
  };
}

async function insertIncident(
  client: Pick<Pool | PoolClient, "query">,
  incidentId: string,
  areaId: string,
  dataClass = DataClass.SENSITIVE,
): Promise<void> {
  await client.query(
    `INSERT INTO incident.incidents
       (id, public_code, type, priority, longitude, latitude, accuracy_m,
        occurred_at, state, source, area_id, data_class)
     VALUES ($1, $2, 'TRAFFIC_ACCIDENT', 'CRITICAL', 108.4384, 11.9404,
             8.5, NOW(), 'RECEIVED', 'MOBILE_SOS', $3, $4)`,
    [incidentId, publicCode(), areaId, dataClass],
  );
}

describe("T04 data platform", () => {
  let pool: Pool;
  const createdIncidentIds: string[] = [];
  const createdEventIds: string[] = [];
  const consumerNames: string[] = [];

  beforeAll(() => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  });

  afterAll(async () => {
    if (SKIP) return;
    await pool.query(
      `DELETE FROM dispatch.assignments
       WHERE incident_id = ANY($1::uuid[])`,
      [createdIncidentIds],
    );
    await pool.query(
      `DELETE FROM platform.outbox
       WHERE event_id = ANY($1::uuid[])`,
      [createdEventIds],
    );
    await pool.query(
      `DELETE FROM platform.inbox_messages
       WHERE consumer_name = ANY($1::text[])`,
      [consumerNames],
    );
    await pool.query(
      `DELETE FROM incident.incidents
       WHERE id = ANY($1::uuid[])`,
      [createdIncidentIds],
    );
    await pool.end();
  });

  it("owns core DDL in migrations with spatial and append-only controls", async () => {
    if (SKIP) return;
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'incident'
         AND table_name IN ('incident_type_catalog', 'incidents', 'status_history')
       ORDER BY table_name`,
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "incident_type_catalog",
      "incidents",
      "status_history",
    ]);

    const indexes = await pool.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname IN ('incident', 'dispatch', 'map')
         AND indexname IN (
           'incidents_geom_idx',
           'dispatch_units_service_area_idx',
           'map_features_geom_idx',
           'map_features_version_idx',
           'dispatch_one_active_assignment_idx'
         )
       ORDER BY indexname`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "dispatch_one_active_assignment_idx",
      "dispatch_units_service_area_idx",
      "incidents_geom_idx",
      "map_features_geom_idx",
      "map_features_version_idx",
    ]);

    const privileges = await pool.query<{
      can_update: boolean;
      can_delete: boolean;
    }>(
      `SELECT
         has_table_privilege(current_user, 'incident.status_history', 'UPDATE') AS can_update,
         has_table_privilege(current_user, 'incident.status_history', 'DELETE') AS can_delete`,
    );
    expect(privileges.rows[0]).toEqual({
      can_update: false,
      can_delete: false,
    });
  });

  it("round-trips validated longitude/latitude as EPSG:4326 geography", async () => {
    if (SKIP) return;
    const incidentId = randomUUID();
    createdIncidentIds.push(incidentId);
    await insertIncident(pool, incidentId, `test-t04-${incidentId}`);

    const result = await pool.query<{
      longitude: number;
      latitude: number;
      srid: number;
      distance_m: string;
    }>(
      `SELECT longitude,
              latitude,
              ST_SRID(geom::geometry) AS srid,
              ST_Distance(
                geom,
                ST_SetSRID(ST_MakePoint(108.4380, 11.9430), 4326)::geography
              )::numeric(10,2)::text AS distance_m
       FROM incident.incidents
       WHERE id = $1`,
      [incidentId],
    );

    expect(result.rows[0]).toMatchObject({
      longitude: 108.4384,
      latitude: 11.9404,
      srid: 4326,
    });
    expect(Number(result.rows[0]?.distance_m)).toBeGreaterThan(100);
    expect(Number(result.rows[0]?.distance_m)).toBeLessThan(1000);
  });

  it.each([
    ["out-of-range longitude", 181, 11.9404, publicCode()],
    ["invalid public code", 108.4384, 11.9404, "INVALID-CODE"],
  ])("rejects %s at the database boundary", async (_name, lon, lat, code) => {
    if (SKIP) return;
    await expect(
      pool.query(
        `INSERT INTO incident.incidents
           (id, public_code, type, priority, longitude, latitude, occurred_at,
            state, source, area_id, data_class)
         VALUES ($1, $2, 'TRAFFIC_ACCIDENT', 'CRITICAL', $3, $4, NOW(),
                 'RECEIVED', 'MOBILE_SOS', 'test-t04-invalid', 'sensitive')`,
        [randomUUID(), code, lon, lat],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("commits the incident and outbox event atomically", async () => {
    if (SKIP) return;
    const incidentId = randomUUID();
    const event = eventFor(incidentId);
    createdIncidentIds.push(incidentId);
    createdEventIds.push(event.event_id);
    const transactions = new PostgresTransactionManager(pool);
    const outbox = new PostgresOutboxWriter();

    await transactions.execute(async (client) => {
      await insertIncident(client, incidentId, `test-t04-${incidentId}`);
      await outbox.append(client, event);
    });

    const result = await pool.query<{
      incident_count: number;
      event_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM incident.incidents WHERE id = $1) AS incident_count,
         (SELECT COUNT(*)::int FROM platform.outbox WHERE event_id = $2) AS event_count`,
      [incidentId, event.event_id],
    );
    expect(result.rows[0]).toEqual({ incident_count: 1, event_count: 1 });
  });

  it("rolls back both the incident and event after a failure", async () => {
    if (SKIP) return;
    const incidentId = randomUUID();
    const event = eventFor(incidentId);
    const transactions = new PostgresTransactionManager(pool);
    const outbox = new PostgresOutboxWriter();

    await expect(
      transactions.execute(async (client) => {
        await insertIncident(client, incidentId, `test-t04-${incidentId}`);
        await outbox.append(client, event);
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");

    const result = await pool.query<{
      incident_count: number;
      event_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM incident.incidents WHERE id = $1) AS incident_count,
         (SELECT COUNT(*)::int FROM platform.outbox WHERE event_id = $2) AS event_count`,
      [incidentId, event.event_id],
    );
    expect(result.rows[0]).toEqual({ incident_count: 0, event_count: 0 });
  });

  it("allows exactly one inbox claim for a duplicate message", async () => {
    if (SKIP) return;
    const inbox = new PostgresInboxStore();
    const event = eventFor(randomUUID());
    const consumerName = `test-t04-${randomUUID()}`;
    consumerNames.push(consumerName);

    const claims = await Promise.all(
      Array.from({ length: 8 }, () => inbox.claim(pool, consumerName, event)),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("enforces role, area, unit, case and data class in the real repository", async () => {
    if (SKIP) return;
    const incidentId = randomUUID();
    const areaId = `test-t04-${incidentId}`;
    createdIncidentIds.push(incidentId);
    await insertIncident(pool, incidentId, areaId);
    const unit = await pool.query<{ unit_id: string }>(
      `SELECT unit_id FROM dispatch.units ORDER BY unit_code LIMIT 1`,
    );
    const unitId = unit.rows[0]!.unit_id;
    await pool.query(
      `INSERT INTO dispatch.assignments
         (incident_id, unit_id, assigned_by_ref)
       VALUES ($1, $2, 'test-officer')`,
      [incidentId, unitId],
    );

    const repository = new PostgresIncidentReadRepository(pool);
    const scoped = (
      role: OfficerRole,
      overrides: Partial<Parameters<typeof createAccessScope>[0]> = {},
    ) =>
      createAccessScope({
        principalId: `test-${role}`,
        role,
        areaIds: [areaId],
        unitIds: [unitId],
        assignedCaseIds: [incidentId],
        maxDataClass: DataClass.SENSITIVE,
        authenticationMethods: ["pwd", "mfa"],
        ...overrides,
      });

    await expect(
      repository.findById(scoped(OfficerRole.DISPATCHER), incidentId),
    ).resolves.toMatchObject({
      id: incidentId,
      areaId,
      assignedUnitId: unitId,
    });

    await expect(
      repository.findById(
        scoped(OfficerRole.DISPATCHER, { areaIds: ["another-area"] }),
        incidentId,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.findById(
        scoped(OfficerRole.FIELD_OFFICER, { unitIds: [randomUUID()] }),
        incidentId,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.findById(
        scoped(OfficerRole.FIELD_OFFICER, {
          assignedCaseIds: [randomUUID()],
        }),
        incidentId,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.findById(
        scoped(OfficerRole.DISPATCHER, {
          maxDataClass: DataClass.INTERNAL,
        }),
        incidentId,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.findById(scoped(OfficerRole.SYSTEM_ADMIN), incidentId),
    ).resolves.toBeNull();
  });

  it("keeps citizen technical identity out of incident business columns", async () => {
    if (SKIP) return;
    const forbidden = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'incident'
         AND table_name = 'incidents'
         AND (
           column_name = ANY(ARRAY[
             'ip', 'ip_address', 'device_fingerprint', 'account_id',
             'session_id', 'session_token', 'citizen_id', 'identity_id', 'token'
           ])
           OR column_name LIKE '%fingerprint%'
           OR column_name LIKE '%session_token%'
         )`,
    );
    expect(forbidden.rows).toEqual([]);
  });
});
