import { randomUUID } from "node:crypto";
import { createAccessScope, DataClass, OfficerRole } from "@atgt/authorization";
import { Pool } from "pg";
import {
  PostgresReportOpsRepository,
  type ReportOpsFailure,
} from "../src/modules/reports/report-ops.repository";
import { PostgresOutboxWriter } from "../src/platform/database/outbox-writer";
import { PostgresTransactionManager } from "../src/platform/database/transaction-manager";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";
const ADMIN_DATABASE_URL =
  process.env["ADMIN_DATABASE_URL"] ??
  "postgresql://postgres:devpassword_local@localhost:5432/atgt_dev";

describe("T11B2A operator report verification", () => {
  let pool: Pool;
  let admin: Pool;
  let repository: PostgresReportOpsRepository;
  const areaId = `test-t11b2-${randomUUID()}`;
  const otherAreaId = `other-${randomUUID()}`;
  const categoryCode = `TEST_VERIFY_${randomUUID()
    .replaceAll("-", "")
    .toUpperCase()}`;
  const traceId = randomUUID().replaceAll("-", "");
  const reportIds: string[] = [];
  const candidateIds: string[] = [];

  const dispatcher = () =>
    createAccessScope({
      principalId: "dispatcher-t11b2",
      role: OfficerRole.DISPATCHER,
      areaIds: [areaId],
      maxDataClass: DataClass.SENSITIVE,
      authenticationMethods: ["pwd", "mfa"],
    });

  async function createReport(state = "PENDING_VERIFICATION"): Promise<string> {
    const id = randomUUID();
    reportIds.push(id);
    const code = `A${randomUUID().replaceAll("-", "").slice(0, 11).toUpperCase()}`;
    await admin.query(
      `INSERT INTO report.reports
         (id,public_code,category_code,longitude,latitude,description,
          plate_text_unverified,reported_at,state,area_id,data_class,version)
       VALUES ($1,$2,$3,108.4384,11.9404,'Synthetic verification fixture',
               '49A-000.00',NOW()-INTERVAL '1 minute',$4,$5,'sensitive',$6)`,
      [
        id,
        code,
        categoryCode,
        state,
        areaId,
        state === "PENDING_VERIFICATION" ? 3 : 1,
      ],
    );
    if (state === "PENDING_VERIFICATION") {
      await admin.query(
        `INSERT INTO report.status_history
           (report_id,from_state,to_state,actor_ref,trace_id)
         VALUES ($1,NULL,'RECEIVED','fixture',$2),
                ($1,'RECEIVED','SCREENING','fixture',$2),
                ($1,'SCREENING','PENDING_VERIFICATION','fixture',$2)`,
        [id, traceId],
      );
    }
    return id;
  }

  async function createCandidate(
    reportId: string,
    candidateReportId: string,
  ): Promise<string> {
    const id = randomUUID();
    candidateIds.push(id);
    await admin.query(
      `INSERT INTO report.duplicate_candidates
         (id,report_id,candidate_report_id,signals,observed_at,source_ref)
       VALUES ($1,$2,$3,ARRAY['HASH','SPACE'],NOW(),'fixture-approved-signals')`,
      [id, reportId, candidateReportId],
    );
    return id;
  }

  beforeAll(async () => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL });
    admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    repository = new PostgresReportOpsRepository(
      pool,
      new PostgresTransactionManager(pool),
      new PostgresOutboxWriter(),
    );
    await admin.query(
      `INSERT INTO report.category_catalog (code,label_vi,label_en,enabled)
       VALUES ($1,'Danh muc xac minh','Verification category',true)`,
      [categoryCode],
    );
  });

  afterAll(async () => {
    if (SKIP) return;
    if (reportIds.length > 0) {
      await admin.query(
        "DELETE FROM platform.outbox WHERE aggregate_id=ANY($1::text[])",
        [reportIds],
      );
      await admin.query(
        `DELETE FROM audit.audit_events
          WHERE object_id=ANY($1::text[])
             OR metadata->>'report_id'=ANY($1::text[])`,
        [reportIds],
      );
      await admin.query(
        "DELETE FROM report.duplicate_candidates WHERE report_id=ANY($1::uuid[])",
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
    await admin.query("DELETE FROM report.category_catalog WHERE code=$1", [
      categoryCode,
    ]);
    await pool.end();
    await admin.end();
  });

  it("returns only the area-scoped pending queue and suggestion metadata", async () => {
    if (SKIP) return;
    const reportId = await createReport();
    const possibleMatch = await createReport("RECEIVED");
    const candidateId = await createCandidate(reportId, possibleMatch);

    const page = await repository.verificationQueue(dispatcher(), areaId, {
      after: "0",
      limit: 100,
    });
    const item = page.items.find((entry) => entry.report.id === reportId);
    expect(item?.report).toMatchObject({
      state: "PENDING_VERIFICATION",
      plateTextUnverified: "49A-000.00",
      duplicateCandidates: [
        {
          id: candidateId,
          status: "PENDING",
          signals: ["HASH", "SPACE"],
          version: 1,
        },
      ],
    });
    expect(item?.report).not.toHaveProperty("publicCode");
    await expect(
      repository.verificationQueue(dispatcher(), otherAreaId, {
        after: "0",
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("assigns the resume cursor when an older report enters the queue", async () => {
    if (SKIP) return;
    const olderReportId = await createReport("RECEIVED");
    const alreadyPendingId = await createReport();
    const before = await repository.verificationQueue(dispatcher(), areaId, {
      after: "0",
      limit: 100,
    });
    const existingCursor = before.items.find(
      (entry) => entry.report.id === alreadyPendingId,
    )!.cursor;
    await admin.query(
      `UPDATE report.reports
          SET state='PENDING_VERIFICATION',version=3,updated_at=NOW()
        WHERE id=$1`,
      [olderReportId],
    );
    const resumed = await repository.verificationQueue(dispatcher(), areaId, {
      after: existingCursor,
      limit: 100,
    });
    expect(resumed.items.map((item) => item.report.id)).toContain(
      olderReportId,
    );
  });

  it("records a false-positive override without concluding the report", async () => {
    if (SKIP) return;
    const reportId = await createReport();
    const possibleMatch = await createReport("RECEIVED");
    const candidateId = await createCandidate(reportId, possibleMatch);
    const result = await repository.markDuplicateFalsePositive(
      dispatcher(),
      areaId,
      reportId,
      candidateId,
      { expectedVersion: 1, reason: "Different road direction on review" },
      traceId,
    );
    expect(result).toMatchObject({ status: "FALSE_POSITIVE", version: 2 });
    const stored = await admin.query<{
      state: string;
      audit_count: number;
      event_count: number;
      payload: Record<string, unknown>;
    }>(
      `SELECT r.state,
         (SELECT count(*)::int FROM audit.audit_events
           WHERE action='report.duplicate.false_positive' AND object_id=$2) audit_count,
         (SELECT count(*)::int FROM platform.outbox
           WHERE event_type='report.duplicate_false_positive.v1'
             AND aggregate_id=$1::text) event_count,
         (SELECT payload FROM platform.outbox
           WHERE event_type='report.duplicate_false_positive.v1'
             AND aggregate_id=$1::text LIMIT 1) payload
       FROM report.reports r WHERE r.id=$1::uuid`,
      [reportId, candidateId],
    );
    expect(stored.rows[0]).toMatchObject({
      state: "PENDING_VERIFICATION",
      audit_count: 1,
      event_count: 1,
      payload: {
        report_id: reportId,
        candidate_id: candidateId,
        area_id: areaId,
        candidate_version: 2,
      },
    });
    expect(JSON.stringify(stored.rows[0]?.payload)).not.toContain("reason");
  });

  it("atomically confirms a candidate and concludes duplicate with optimistic versions", async () => {
    if (SKIP) return;
    const reportId = await createReport();
    const possibleMatch = await createReport("RECEIVED");
    const candidateId = await createCandidate(reportId, possibleMatch);
    const result = await repository.decide(
      dispatcher(),
      areaId,
      reportId,
      {
        decision: "DUPLICATE",
        expectedVersion: 3,
        reason: "Operator confirmed the same immutable evidence",
        duplicateCandidateId: candidateId,
        duplicateCandidateExpectedVersion: 1,
      },
      traceId,
      new Date(0),
    );
    expect(new Date(result.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(result.createdAt).getTime(),
    );
    expect(result).toMatchObject({
      id: reportId,
      state: "DUPLICATE",
      version: 4,
      duplicateCandidates: [
        { id: candidateId, status: "CONFIRMED", version: 2 },
      ],
    });
    const stored = await admin.query<{
      history: number;
      audit: number;
      event_count: number;
      payload: Record<string, unknown>;
    }>(
      `SELECT
         (SELECT count(*)::int FROM report.status_history
           WHERE report_id=$1 AND to_state='DUPLICATE') history,
         (SELECT count(*)::int FROM audit.audit_events
           WHERE action='report.verification.decide' AND object_id=$1::text) audit,
         (SELECT count(*)::int FROM platform.outbox
           WHERE event_type='report.verification_decided.v1'
             AND aggregate_id=$1::text) event_count,
         (SELECT payload FROM platform.outbox
           WHERE event_type='report.verification_decided.v1'
             AND aggregate_id=$1::text LIMIT 1) payload`,
      [reportId],
    );
    expect(stored.rows[0]).toMatchObject({
      history: 1,
      audit: 1,
      event_count: 1,
      payload: {
        report_id: reportId,
        area_id: areaId,
        state: "DUPLICATE",
        version: 4,
      },
    });
    expect(JSON.stringify(stored.rows[0]?.payload)).not.toContain("plate");
    await expect(
      repository.decide(
        dispatcher(),
        areaId,
        reportId,
        { decision: "VERIFIED", expectedVersion: 3 },
        traceId,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ReportOpsFailure>>({
        code: "INVALID_TRANSITION",
      }),
    );
  });

  it("denies non-dispatchers and direct mutation of resolved suggestions", async () => {
    if (SKIP) return;
    const reportId = await createReport();
    const possibleMatch = await createReport("RECEIVED");
    const candidateId = await createCandidate(reportId, possibleMatch);
    const fieldOfficer = createAccessScope({
      principalId: "field-t11b2",
      role: OfficerRole.FIELD_OFFICER,
      areaIds: [areaId],
      unitIds: ["unit-test"],
      assignedCaseIds: [reportId],
      maxDataClass: DataClass.SENSITIVE,
    });
    await expect(
      repository.decide(
        fieldOfficer,
        areaId,
        reportId,
        { decision: "VERIFIED", expectedVersion: 3 },
        traceId,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await repository.markDuplicateFalsePositive(
      dispatcher(),
      areaId,
      reportId,
      candidateId,
      { expectedVersion: 1, reason: "Reviewed mismatch" },
      traceId,
    );
    await expect(
      pool.query(
        `UPDATE report.duplicate_candidates
            SET status='CONFIRMED',version=version+1
          WHERE id=$1`,
        [candidateId],
      ),
    ).rejects.toThrow("invalid duplicate candidate resolution transition");
  });
});
