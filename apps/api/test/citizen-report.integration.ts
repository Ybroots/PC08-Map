import { randomUUID } from "node:crypto";
import type { CreateCitizenReport } from "@atgt/contracts";
import { Pool } from "pg";
import {
  PostgresReportRepository,
  type ReportFailure,
} from "../src/modules/reports/report.repository";
import { PostgresOutboxWriter } from "../src/platform/database/outbox-writer";
import { PostgresTransactionManager } from "../src/platform/database/transaction-manager";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";
const ADMIN_DATABASE_URL =
  process.env["ADMIN_DATABASE_URL"] ??
  "postgresql://postgres:devpassword_local@localhost:5432/atgt_dev";

describe("T11A anonymous citizen report intake", () => {
  let pool: Pool;
  let admin: Pool;
  let reports: PostgresReportRepository;
  const areaId = `test-t11-${randomUUID()}`;
  const categoryCode = `TEST_REPORT_${randomUUID()
    .replaceAll("-", "")
    .toUpperCase()}`;
  const traceId = randomUUID().replaceAll("-", "");
  const keys: string[] = [];

  const payload = (
    overrides: Partial<CreateCitizenReport> = {},
  ): CreateCitizenReport => ({
    categoryCode,
    coordinateLongitude: 108.4384,
    coordinateLatitude: 11.9404,
    description: "Synthetic anonymous citizen report fixture",
    plateTextUnverified: "49A-000.00",
    clientReportedAt: "2026-08-19T05:00:00.000Z",
    ...overrides,
  });

  beforeAll(async () => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL, max: 12 });
    admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(
      `INSERT INTO report.category_catalog (code,label_vi,label_en,enabled)
       VALUES ($1,'Danh muc test','Test category',true)
       ON CONFLICT (code) DO NOTHING`,
      [categoryCode],
    );
    reports = new PostgresReportRepository(
      pool,
      new PostgresTransactionManager(pool),
      new PostgresOutboxWriter(),
      { enabled: true, intakeAreaId: areaId, idempotencyTtlMinutes: 60 },
    );
  });

  afterAll(async () => {
    if (SKIP) return;
    const ids = await admin.query<{ id: string }>(
      "SELECT id FROM report.reports WHERE area_id=$1",
      [areaId],
    );
    const reportIds = ids.rows.map((row) => row.id);
    if (reportIds.length > 0) {
      await admin.query(
        "DELETE FROM platform.outbox WHERE aggregate_id=ANY($1::text[])",
        [reportIds],
      );
      await admin.query(
        "DELETE FROM audit.audit_events WHERE object_id=ANY($1::text[])",
        [reportIds],
      );
      await admin.query(
        "DELETE FROM report.status_history WHERE report_id=ANY($1::uuid[])",
        [reportIds],
      );
      await admin.query("DELETE FROM report.reports WHERE id=ANY($1::uuid[])", [
        reportIds,
      ]);
    }
    if (keys.length > 0) {
      await admin.query(
        "DELETE FROM platform.idempotency_keys WHERE idempotency_key=ANY($1::text[])",
        [keys.map((key) => `report:${key}`)],
      );
    }
    await admin.query("DELETE FROM report.category_catalog WHERE code=$1", [
      categoryCode,
    ]);
    await pool.end();
    await admin.end();
  });

  it("atomically stores a PII-free report, history, audit, event and replay response", async () => {
    if (SKIP) return;
    const key = randomUUID();
    keys.push(key);
    const accepted = await reports.accept(payload(), key, traceId);
    expect(accepted.replayed).toBe(false);
    expect(accepted.response).toMatchObject({ status: "RECEIVED" });

    const stored = await pool.query<{
      reports: number;
      history: number;
      audit: number;
      outbox: number;
      idempotency: number;
      risk_score: string | null;
      plate_text_unverified: string | null;
      payload: Record<string, unknown>;
    }>(
      `SELECT
         (SELECT count(*)::int FROM report.reports WHERE public_code=$1) reports,
         (SELECT count(*)::int FROM report.status_history h JOIN report.reports r ON r.id=h.report_id WHERE r.public_code=$1) history,
         (SELECT count(*)::int FROM audit.audit_events WHERE action='report.accept' AND object_id=(SELECT id::text FROM report.reports WHERE public_code=$1)) audit,
         (SELECT count(*)::int FROM platform.outbox WHERE event_type='report.received.v1' AND aggregate_id=(SELECT id::text FROM report.reports WHERE public_code=$1)) outbox,
         (SELECT count(*)::int FROM platform.idempotency_keys WHERE idempotency_key=$2 AND state='COMPLETED') idempotency,
         (SELECT risk_score::text FROM report.reports WHERE public_code=$1) risk_score,
         (SELECT plate_text_unverified FROM report.reports WHERE public_code=$1) plate_text_unverified,
         (SELECT payload FROM platform.outbox WHERE event_type='report.received.v1' AND aggregate_id=(SELECT id::text FROM report.reports WHERE public_code=$1) LIMIT 1) payload`,
      [accepted.response.publicCode, `report:${key}`],
    );
    expect(stored.rows[0]).toMatchObject({
      reports: 1,
      history: 1,
      audit: 1,
      outbox: 1,
      idempotency: 1,
      risk_score: null,
      plate_text_unverified: "49A-000.00",
    });
    expect(stored.rows[0]?.payload).toEqual({
      report_id: expect.any(String),
      category_code: categoryCode,
      area_id: areaId,
      state: "RECEIVED",
    });
  });

  it("replays exactly and serializes concurrent retry into one report", async () => {
    if (SKIP) return;
    const key = randomUUID();
    keys.push(key);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => reports.accept(payload(), key, traceId)),
    );
    expect(
      new Set(results.map((result) => result.response.publicCode)).size,
    ).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    await expect(
      reports.accept(
        payload({ description: "A different report" }),
        key,
        traceId,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ReportFailure>>({
        code: "IDEMPOTENCY_CONFLICT",
      }),
    );
  });

  it("returns only generalized tracking and uniform not-found", async () => {
    if (SKIP) return;
    const key = randomUUID();
    keys.push(key);
    const accepted = await reports.accept(payload(), key, traceId);
    expect(await reports.publicTracking(accepted.response.publicCode)).toEqual({
      publicCode: accepted.response.publicCode,
      status: "RECEIVED",
      receivedAt: accepted.response.receivedAt,
      lastUpdatedAt: accepted.response.receivedAt,
    });
    await expect(reports.publicTracking("not-a-code")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(reports.publicTracking("000000000000")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("has no technical identity columns and protects acknowledged payload", async () => {
    if (SKIP) return;
    const forbidden = await admin.query<{ column_name: string }>(
      `SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='report' AND table_name='reports'
          AND column_name = ANY(ARRAY[
            'session_id','citizen_session_id','device_id','device_identifier',
            'account_id','token','ip','ip_address','identity_id'
          ])`,
    );
    expect(forbidden.rows).toEqual([]);
    const privileges = await admin.query<{
      report_delete: boolean;
      history_update: boolean;
      history_delete: boolean;
    }>(`SELECT
          has_table_privilege('atgt_app','report.reports','DELETE') report_delete,
          has_table_privilege('atgt_app','report.status_history','UPDATE') history_update,
          has_table_privilege('atgt_app','report.status_history','DELETE') history_delete`);
    expect(privileges.rows[0]).toEqual({
      report_delete: false,
      history_update: false,
      history_delete: false,
    });
    const key = randomUUID();
    keys.push(key);
    const accepted = await reports.accept(payload(), key, traceId);
    await expect(
      pool.query(
        "UPDATE report.reports SET description='tampered' WHERE public_code=$1",
        [accepted.response.publicCode],
      ),
    ).rejects.toThrow("submitted citizen report payload is immutable");
  });

  it("fails closed and rejects unavailable categories without partial writes", async () => {
    if (SKIP) return;
    const blocked = new PostgresReportRepository(
      pool,
      new PostgresTransactionManager(pool),
      new PostgresOutboxWriter(),
      { enabled: false },
    );
    await expect(
      blocked.accept(payload(), randomUUID(), traceId),
    ).rejects.toMatchObject({ code: "CONFIGURATION_BLOCKED" });
    const key = randomUUID();
    keys.push(key);
    await expect(
      reports.accept(
        payload({ categoryCode: "UNAVAILABLE_REPORT_CATEGORY" }),
        key,
        traceId,
      ),
    ).rejects.toMatchObject({ code: "CATEGORY_UNAVAILABLE" });
    const partial = await pool.query<{ count: number }>(
      "SELECT count(*)::int count FROM platform.idempotency_keys WHERE idempotency_key=$1",
      [`report:${key}`],
    );
    expect(partial.rows[0]?.count).toBe(0);
  });
});
