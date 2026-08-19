import { randomUUID } from "node:crypto";
import {
  EVENT_ROUTING_KEYS,
  type ReportEvidenceLinkedEvent,
  type ReportReceivedEvent,
} from "@atgt/contracts";
import { Pool } from "pg";
import { PostgresReportScreeningCoordinator } from "../src/reports/postgres-report-screening-coordinator";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";
const ADMIN_DATABASE_URL =
  process.env["ADMIN_DATABASE_URL"] ??
  "postgresql://postgres:devpassword_local@localhost:5432/atgt_dev";

describe("T11B2B1 local report screening worker", () => {
  let pool: Pool;
  let admin: Pool;
  let coordinator: PostgresReportScreeningCoordinator;
  const areaId = `test-screening-${randomUUID()}`;
  const categoryCode = `TEST_SCREEN_${randomUUID()
    .replaceAll("-", "")
    .toUpperCase()}`;
  const reportIds: string[] = [];
  const evidenceIds: string[] = [];
  const eventIds: string[] = [];

  function receivedEvent(reportId: string): ReportReceivedEvent {
    const eventId = randomUUID();
    eventIds.push(eventId);
    return {
      event_id: eventId,
      type: EVENT_ROUTING_KEYS.REPORT_RECEIVED,
      version: 1,
      occurred_at: new Date().toISOString(),
      trace_id: randomUUID().replaceAll("-", ""),
      aggregate_id: reportId,
      aggregate_type: "report",
      data: {
        report_id: reportId,
        category_code: categoryCode,
        area_id: areaId,
        state: "RECEIVED",
      },
    };
  }

  function linkedEvent(
    reportId: string,
    evidenceId: string,
  ): ReportEvidenceLinkedEvent {
    const eventId = randomUUID();
    eventIds.push(eventId);
    return {
      event_id: eventId,
      type: EVENT_ROUTING_KEYS.REPORT_EVIDENCE_LINKED,
      version: 1,
      occurred_at: new Date().toISOString(),
      trace_id: randomUUID().replaceAll("-", ""),
      aggregate_id: reportId,
      aggregate_type: "report",
      data: { report_id: reportId, evidence_id: evidenceId, area_id: areaId },
    };
  }

  async function createReport(ageMinutes: number): Promise<string> {
    const id = randomUUID();
    reportIds.push(id);
    const code = `A${randomUUID().replaceAll("-", "").slice(0, 11).toUpperCase()}`;
    await admin.query(
      `INSERT INTO report.reports
         (id,public_code,category_code,longitude,latitude,description,
          reported_at,state,area_id,data_class,version,created_at,updated_at)
       VALUES ($1,$2,$3,108.4384,11.9404,'Synthetic screening fixture',
               NOW()-($4::text||' minutes')::interval,'RECEIVED',$5,
               'sensitive',1,NOW()-($4::text||' minutes')::interval,
               NOW()-($4::text||' minutes')::interval)`,
      [id, code, categoryCode, ageMinutes, areaId],
    );
    return id;
  }

  async function attachReadyEvidence(
    reportId: string,
    sha256: string,
  ): Promise<string> {
    const evidenceId = randomUUID();
    evidenceIds.push(evidenceId);
    await admin.query(
      `INSERT INTO evidence.uploads
         (upload_id,capability_hash,quarantine_object_key,declared_sha256,
          declared_mime,declared_size_bytes,state,observed_sha256,created_at,
          expires_at,finalized_at,processed_at)
       VALUES ($1,$2,$3,$4,'image/jpeg',128,'READY',$4,NOW(),
               NOW()+INTERVAL '1 hour',NOW(),NOW())`,
      [
        evidenceId,
        "d".repeat(64),
        `quarantine/screening/${evidenceId}`,
        sha256,
      ],
    );
    await admin.query(
      `INSERT INTO evidence.objects
         (evidence_id,owner_type,owner_id,area_id,data_class,
          original_object_key,derivative_object_key,sha256,mime,size_bytes,
          scan_engine,scan_engine_version)
       VALUES ($1,'report',$2,$3,'sensitive',$4,$5,$6,'image/jpeg',128,
               'fixture-av','1')`,
      [
        evidenceId,
        reportId,
        areaId,
        `original/screening/${evidenceId}`,
        `derivative/screening/${evidenceId}`,
        sha256,
      ],
    );
    return evidenceId;
  }

  beforeAll(async () => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
    admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 2 });
    coordinator = new PostgresReportScreeningCoordinator(pool);
    await admin.query(
      `INSERT INTO report.category_catalog (code,label_vi,label_en,enabled)
       VALUES ($1,'Danh muc screening','Screening category',true)`,
      [categoryCode],
    );
  });

  afterAll(async () => {
    if (SKIP) return;
    if (eventIds.length > 0) {
      await admin.query(
        `DELETE FROM platform.inbox_messages
          WHERE consumer_name='report-screening-worker'
            AND message_id=ANY($1::uuid[])`,
        [eventIds],
      );
    }
    if (reportIds.length > 0) {
      const candidateIds = await admin.query<{ id: string }>(
        `SELECT id FROM report.duplicate_candidates
          WHERE report_id=ANY($1::uuid[])`,
        [reportIds],
      );
      const auditObjectIds = [
        ...reportIds,
        ...candidateIds.rows.map((row) => row.id),
      ];
      await admin.query(
        "DELETE FROM platform.outbox WHERE aggregate_id=ANY($1::text[])",
        [reportIds],
      );
      await admin.query(
        "DELETE FROM audit.audit_events WHERE object_id=ANY($1::text[])",
        [auditObjectIds],
      );
      await admin.query(
        "DELETE FROM report.duplicate_candidates WHERE report_id=ANY($1::uuid[])",
        [reportIds],
      );
      await admin.query(
        "DELETE FROM report.status_history WHERE report_id=ANY($1::uuid[])",
        [reportIds],
      );
    }
    if (evidenceIds.length > 0) {
      await admin.query(
        "DELETE FROM evidence.objects WHERE evidence_id=ANY($1::uuid[])",
        [evidenceIds],
      );
      await admin.query(
        "DELETE FROM evidence.uploads WHERE upload_id=ANY($1::uuid[])",
        [evidenceIds],
      );
    }
    if (reportIds.length > 0) {
      await admin.query("DELETE FROM report.reports WHERE id=ANY($1::uuid[])", [
        reportIds,
      ]);
    }
    await admin.query("DELETE FROM report.category_catalog WHERE code=$1", [
      categoryCode,
    ]);
    await pool.end();
    await admin.end();
  });

  it("idempotently moves RECEIVED through screening into manual verification", async () => {
    if (SKIP) return;
    const reportId = await createReport(20);
    const event = receivedEvent(reportId);
    await expect(coordinator.process(event, 5)).resolves.toBe("PROCESSED");
    await expect(coordinator.process(event, 5)).resolves.toBe("DUPLICATE");
    const stored = await admin.query<{
      state: string;
      version: number;
      risk_score: string | null;
      history: number;
      audit_count: number;
      event_count: number;
      inbox_count: number;
      payload: Record<string, unknown>;
    }>(
      `SELECT r.state,r.version,r.risk_score::text,
         (SELECT count(*)::int FROM report.status_history
           WHERE report_id=r.id) history,
         (SELECT count(*)::int FROM audit.audit_events
           WHERE action='report.screening.manual_queue' AND object_id=r.id::text) audit_count,
         (SELECT count(*)::int FROM platform.outbox
           WHERE event_type='report.screening_completed.v1'
             AND aggregate_id=r.id::text) event_count,
         (SELECT count(*)::int FROM platform.inbox_messages
           WHERE consumer_name='report-screening-worker' AND message_id=$2) inbox_count,
         (SELECT payload FROM platform.outbox
           WHERE event_type='report.screening_completed.v1'
             AND aggregate_id=r.id::text LIMIT 1) payload
       FROM report.reports r WHERE r.id=$1`,
      [reportId, event.event_id],
    );
    expect(stored.rows[0]).toMatchObject({
      state: "PENDING_VERIFICATION",
      version: 3,
      risk_score: null,
      history: 2,
      audit_count: 1,
      event_count: 1,
      inbox_count: 1,
      payload: {
        report_id: reportId,
        area_id: areaId,
        state: "PENDING_VERIFICATION",
        version: 3,
        mode: "MANUAL_REVIEW_ONLY",
      },
    });
  });

  it("rejects an event whose area does not match the persisted report", async () => {
    if (SKIP) return;
    const reportId = await createReport(20);
    const event = receivedEvent(reportId);
    event.data.area_id = "tampered-area";
    await expect(coordinator.process(event, 5)).rejects.toMatchObject({
      code: "EVENT_REPORT_MISMATCH",
      retryable: false,
    });
    const stored = await admin.query<{
      state: string;
      version: number;
      inbox_count: number;
    }>(
      `SELECT r.state,r.version,
         (SELECT count(*)::int FROM platform.inbox_messages
           WHERE consumer_name='report-screening-worker' AND message_id=$2) inbox_count
       FROM report.reports r WHERE r.id=$1`,
      [reportId, event.event_id],
    );
    expect(stored.rows[0]).toEqual({
      state: "RECEIVED",
      version: 1,
      inbox_count: 0,
    });
  });

  it("creates only exact-hash suggestions and never concludes the report", async () => {
    if (SKIP) return;
    const sha256 = "a".repeat(64);
    const olderReportId = await createReport(30);
    await attachReadyEvidence(olderReportId, sha256);
    const reportId = await createReport(10);
    const evidenceId = await attachReadyEvidence(reportId, sha256);
    const event = linkedEvent(reportId, evidenceId);
    await expect(coordinator.process(event, 5)).resolves.toBe("PROCESSED");
    const stored = await admin.query<{
      state: string;
      version: number;
      candidate_report_id: string;
      signals: string[];
      status: string;
      source_ref: string;
      audit_count: number;
      event_count: number;
      payload: Record<string, unknown>;
    }>(
      `SELECT r.state,r.version,c.candidate_report_id::text,c.signals,c.status,
              c.source_ref,
         (SELECT count(*)::int FROM audit.audit_events
           WHERE action='report.duplicate.suggest' AND object_id=c.id::text) audit_count,
         (SELECT count(*)::int FROM platform.outbox
           WHERE event_type='report.duplicate_candidate_created.v1'
             AND aggregate_id=r.id::text) event_count,
         (SELECT payload FROM platform.outbox
           WHERE event_type='report.duplicate_candidate_created.v1'
             AND aggregate_id=r.id::text LIMIT 1) payload
       FROM report.reports r
       JOIN report.duplicate_candidates c ON c.report_id=r.id
       WHERE r.id=$1`,
      [reportId],
    );
    expect(stored.rows[0]).toMatchObject({
      state: "PENDING_VERIFICATION",
      version: 3,
      candidate_report_id: olderReportId,
      signals: ["HASH"],
      status: "PENDING",
      source_ref: "exact-evidence-sha256-v1",
      audit_count: 1,
      event_count: 1,
      payload: {
        report_id: reportId,
        candidate_report_id: olderReportId,
        area_id: areaId,
        signals: ["HASH"],
      },
    });
    expect(JSON.stringify(stored.rows[0]?.payload)).not.toContain(sha256);
  });

  it("fails closed without partial state when exact matches exceed the explicit cap", async () => {
    if (SKIP) return;
    const sha256 = "b".repeat(64);
    for (const age of [40, 30]) {
      const older = await createReport(age);
      await attachReadyEvidence(older, sha256);
    }
    const reportId = await createReport(10);
    const evidenceId = await attachReadyEvidence(reportId, sha256);
    const event = linkedEvent(reportId, evidenceId);
    await expect(coordinator.process(event, 1)).rejects.toMatchObject({
      code: "CANDIDATE_LIMIT_EXCEEDED",
      retryable: false,
    });
    const stored = await admin.query<{
      state: string;
      version: number;
      history: number;
      candidates: number;
      inbox_count: number;
    }>(
      `SELECT r.state,r.version,
         (SELECT count(*)::int FROM report.status_history
           WHERE report_id=r.id) history,
         (SELECT count(*)::int FROM report.duplicate_candidates
           WHERE report_id=r.id) candidates,
         (SELECT count(*)::int FROM platform.inbox_messages
           WHERE consumer_name='report-screening-worker' AND message_id=$2) inbox_count
       FROM report.reports r WHERE r.id=$1`,
      [reportId, event.event_id],
    );
    expect(stored.rows[0]).toEqual({
      state: "RECEIVED",
      version: 1,
      history: 0,
      candidates: 0,
      inbox_count: 0,
    });
  });
});
