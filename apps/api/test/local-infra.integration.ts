/**
 * Local Dev Infrastructure Smoke Test (T01)
 *
 * Tests that all required services are reachable and healthy.
 * Run with: pnpm test:integration
 *
 * Skipped if environment variable SKIP_SMOKE=true (CI without services)
 */
import { Client } from "pg";
import * as net from "net";

const SKIP = process.env["SKIP_SMOKE"] === "true";

function tcpCheck(
  host: string,
  port: number,
  timeoutMs = 3000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
    socket.connect(port, host);
  });
}

describe("T01: Local dev infrastructure smoke tests", () => {
  // ============================================================
  // PostgreSQL / PostGIS
  // ============================================================
  describe("PostgreSQL + PostGIS", () => {
    let client: Client;

    beforeAll(async () => {
      if (SKIP) return;
      client = new Client({
        connectionString:
          process.env["DATABASE_URL"] ??
          "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev",
      });
      await client.connect();
    });

    afterAll(async () => {
      if (client) await client.end();
    });

    it("connects to PostgreSQL", async () => {
      if (SKIP) return;
      const result = await client.query("SELECT 1 AS ping");
      expect(result.rows[0]?.ping).toBe(1);
    });

    it("PostGIS extension is available", async () => {
      if (SKIP) return;
      const result = await client.query("SELECT PostGIS_Version() AS version");
      expect(result.rows[0]?.version).toBeTruthy();
    });

    it("required schemas exist", async () => {
      if (SKIP) return;
      const result = await client.query(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name IN ('incident','dispatch','report','evidence','map','platform','audit','analytics','identity')
        ORDER BY schema_name
      `);
      const schemas = result.rows.map(
        (r: { schema_name: string }) => r.schema_name,
      );
      expect(schemas).toContain("incident");
      expect(schemas).toContain("dispatch");
      expect(schemas).toContain("audit");
      expect(schemas).toContain("platform");
      expect(schemas).toContain("identity");
    });

    it("outbox table exists", async () => {
      if (SKIP) return;
      const result = await client.query(`
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'platform' AND table_name = 'outbox'
      `);
      expect(parseInt(result.rows[0]?.count)).toBe(1);
    });

    it("T04 core data and inbox tables exist", async () => {
      if (SKIP) return;
      const result = await client.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE (table_schema, table_name) IN (
          ('incident', 'incidents'),
          ('incident', 'status_history'),
          ('dispatch', 'assignments'),
          ('map', 'features'),
          ('platform', 'inbox_messages')
        )
      `);
      expect(result.rows).toHaveLength(5);
    });

    it("loads development seed data during first initialization", async () => {
      if (SKIP) return;
      const result = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM incident.incident_type_catalog
      `);
      expect(result.rows[0]?.count).toBeGreaterThanOrEqual(6);
    });

    it("loads T11A report tables and only synthetic category seed data", async () => {
      if (SKIP) return;
      const result = await client.query(`
        SELECT
          (SELECT count(*)::int FROM information_schema.tables
            WHERE table_schema='report'
              AND table_name IN ('category_catalog','reports','status_history')) AS table_count,
          (SELECT count(*)::int FROM report.category_catalog
            WHERE label_vi LIKE '%(FAKE)%' AND label_en LIKE '%(FAKE)%') AS fake_category_count
      `);
      expect(result.rows[0]).toEqual({
        table_count: 3,
        fake_category_count: 3,
      });
    });

    it("loads the T11B1 atomic READY evidence attachment boundary", async () => {
      if (SKIP) return;
      const result = await client.query<{ function_count: number }>(`
        SELECT count(*)::int function_count
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='evidence' AND p.proname='attach_ready_to_report'
      `);
      expect(result.rows[0]?.function_count).toBe(1);
    });

    it("loads T11B2 operator candidates and exact-hash screening index", async () => {
      if (SKIP) return;
      const result = await client.query<{
        candidate_table: string | null;
        screening_index: string | null;
      }>(`
        SELECT
          to_regclass('report.duplicate_candidates')::text candidate_table,
          to_regclass('evidence.evidence_report_sha256_owner_idx')::text screening_index
      `);
      expect(result.rows[0]).toEqual({
        candidate_table: "report.duplicate_candidates",
        screening_index: "evidence.evidence_report_sha256_owner_idx",
      });
    });

    it("loads the synthetic T13A alert fixture as explicit dev-only data", async () => {
      if (SKIP) return;
      const result = await client.query<{
        warning: string | null;
        action: string | null;
        vehicles: unknown;
      }>(`
        SELECT properties->'alert'->>'warning_vi' warning,
               properties->'alert'->>'action_vi' action,
               properties->'alert'->'vehicle_types' vehicles
          FROM map.features
         WHERE feature_key='danger-hoabinh-fake'
           AND version_id='00000000-0000-4000-8000-000000000601'::uuid
      `);
      expect(result.rows[0]?.warning).toContain("FAKE - dev only");
      expect(result.rows[0]?.action).toContain("FAKE - dev only");
      expect(result.rows[0]?.vehicles).toEqual(["ALL"]);
    });

    it("audit.audit_events table exists", async () => {
      if (SKIP) return;
      const result = await client.query(`
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'audit' AND table_name = 'audit_events'
      `);
      expect(parseInt(result.rows[0]?.count)).toBe(1);
    });

    it("can insert and query a spatial point", async () => {
      if (SKIP) return;
      // Da Lat coordinates
      const result = await client.query(`
        SELECT ST_AsText(ST_SetSRID(ST_MakePoint(108.4384, 11.9404), 4326)) AS wkt
      `);
      expect(result.rows[0]?.wkt).toContain("POINT");
    });

    it("ST_Distance works (meters via geography cast)", async () => {
      if (SKIP) return;
      const result = await client.query(`
        SELECT ROUND(
          ST_Distance(
            ST_SetSRID(ST_MakePoint(108.4384, 11.9404), 4326)::geography,
            ST_SetSRID(ST_MakePoint(108.4380, 11.9430), 4326)::geography
          )::numeric, 0
        ) AS distance_m
      `);
      const distM = parseInt(result.rows[0]?.distance_m);
      expect(distM).toBeGreaterThan(100); // at least 100m apart
      expect(distM).toBeLessThan(1000); // less than 1km
    });
  });

  // ============================================================
  // RabbitMQ
  // ============================================================
  describe("RabbitMQ", () => {
    it("is reachable on port 5672", async () => {
      if (SKIP) return;
      const ok = await tcpCheck("localhost", 5672);
      expect(ok).toBe(true);
    });

    it("management API is reachable on port 15672", async () => {
      if (SKIP) return;
      const ok = await tcpCheck("localhost", 15672);
      expect(ok).toBe(true);
    });

    it("durably binds report intake events to the screening queue", async () => {
      if (SKIP) return;
      const authorization = Buffer.from(
        "atgt:devpassword_local",
        "utf8",
      ).toString("base64");
      const response = await fetch(
        "http://localhost:15672/api/bindings/%2F/e/atgt.events/q/reports.screening",
        { headers: { authorization: `Basic ${authorization}` } },
      );
      expect(response.status).toBe(200);
      const bindings = (await response.json()) as Array<{
        routing_key: string;
      }>;
      expect(bindings.map((binding) => binding.routing_key)).toContain(
        "report.received.v1",
      );
      expect(bindings.map((binding) => binding.routing_key)).toContain(
        "report.evidence_linked.v1",
      );
    });

    it("durably isolates operator decisions in the report lifecycle queue", async () => {
      if (SKIP) return;
      const authorization = Buffer.from(
        "atgt:devpassword_local",
        "utf8",
      ).toString("base64");
      const response = await fetch(
        "http://localhost:15672/api/bindings/%2F/e/atgt.events/q/reports.lifecycle",
        { headers: { authorization: `Basic ${authorization}` } },
      );
      expect(response.status).toBe(200);
      const routingKeys = (
        (await response.json()) as Array<{
          routing_key: string;
        }>
      ).map((binding) => binding.routing_key);
      expect(routingKeys).toEqual(
        expect.arrayContaining([
          "report.verification_decided.v1",
          "report.duplicate_false_positive.v1",
          "report.screening_completed.v1",
          "report.duplicate_candidate_created.v1",
        ]),
      );
    });
  });

  // ============================================================
  // Redis
  // ============================================================
  describe("Redis", () => {
    it("is reachable on port 6379", async () => {
      if (SKIP) return;
      const ok = await tcpCheck("localhost", 6379);
      expect(ok).toBe(true);
    });
  });

  // ============================================================
  // MinIO / S3
  // ============================================================
  describe("MinIO (S3-compatible)", () => {
    it("is reachable on port 9000", async () => {
      if (SKIP) return;
      const ok = await tcpCheck("localhost", 9000);
      expect(ok).toBe(true);
    });

    it("console is reachable on port 9001", async () => {
      if (SKIP) return;
      const ok = await tcpCheck("localhost", 9001);
      expect(ok).toBe(true);
    });
  });

  // ============================================================
  // Environment config validation
  // ============================================================
  describe("Environment config", () => {
    it("DATABASE_URL is set and not a production URL", () => {
      if (SKIP) return;
      const url =
        process.env["DATABASE_URL"] ??
        "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";
      expect(url).toContain("localhost");
      expect(url).not.toContain("prod");
      expect(url).not.toContain("production");
    });

    it("VIETMAP_USE_FAKE_ADAPTER is true in local dev", () => {
      if (SKIP) return;
      const fake = process.env["VIETMAP_USE_FAKE_ADAPTER"];
      // In dev, always use fake adapter (real key not yet available - D-03)
      expect(["true", undefined]).toContain(fake);
    });

    it("PRIVACY_POLICY_VERSION is PENDING (feature not yet approved)", () => {
      if (SKIP) return;
      const version = process.env["PRIVACY_POLICY_VERSION"] ?? "PENDING";
      expect(version).toBe("PENDING");
    });
  });
});
