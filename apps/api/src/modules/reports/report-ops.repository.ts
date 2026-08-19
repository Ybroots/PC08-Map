import { randomUUID } from "node:crypto";
import {
  AuthorizationPolicy,
  DataClass,
  OfficerRole,
  PolicyAction,
  requireAccessScope,
  type AccessScope,
} from "@atgt/authorization";
import {
  EVENT_ROUTING_KEYS,
  type DuplicateFalsePositiveRequest,
  type OpsReport,
  type OpsReportDuplicateCandidate,
  type OpsReportVerificationDecision,
  type OpsReportVerificationQueue,
  type OpsReportVerificationQueueQuery,
  type ReportDuplicateFalsePositiveEventData,
  type ReportVerificationDecidedEventData,
} from "@atgt/contracts";
import {
  ReportRuleViolation,
  ReportState,
  transitionReport,
} from "@atgt/domain";
import type { Pool, PoolClient } from "pg";
import { PostgresOutboxWriter } from "../../platform/database";
import { PostgresTransactionManager } from "../../platform/database/transaction-manager";

interface ReportRow {
  id: string;
  category_code: string;
  longitude: number;
  latitude: number;
  description: string;
  plate_text_unverified: string | null;
  reported_at: Date;
  state: ReportState;
  area_id: string;
  data_class: DataClass;
  version: number;
  verification_sequence: string;
  created_at: Date;
  updated_at: Date;
}

interface CandidateRow {
  id: string;
  report_id: string;
  candidate_report_id: string;
  signals: Array<"TIME" | "SPACE" | "HASH" | "PLATE">;
  status: "PENDING" | "CONFIRMED" | "FALSE_POSITIVE";
  observed_at: Date;
  version: number;
}

export type ReportOpsFailureCode =
  "FORBIDDEN" | "NOT_FOUND" | "INVALID_TRANSITION" | "CANDIDATE_CONFLICT";

export class ReportOpsFailure extends Error {
  constructor(
    readonly code: ReportOpsFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "ReportOpsFailure";
  }
}

const DATA_CLASS_RANK: Readonly<Record<DataClass, number>> = {
  [DataClass.PUBLIC]: 0,
  [DataClass.INTERNAL]: 1,
  [DataClass.SENSITIVE]: 2,
  [DataClass.RESTRICTED]: 3,
};

const REPORT_COLUMNS = `id,category_code,longitude,latitude,description,
  plate_text_unverified,reported_at,state,area_id,data_class,version,
  verification_sequence::text,created_at,updated_at`;

function mapCandidate(row: CandidateRow): OpsReportDuplicateCandidate {
  return {
    id: row.id,
    candidateReportId: row.candidate_report_id,
    signals: row.signals,
    status: row.status,
    observedAt: row.observed_at.toISOString(),
    version: row.version,
  };
}

function mapReport(
  row: ReportRow,
  candidates: OpsReportDuplicateCandidate[],
): OpsReport {
  return {
    id: row.id,
    categoryCode: row.category_code,
    coordinateLongitude: row.longitude,
    coordinateLatitude: row.latitude,
    description: row.description,
    ...(row.plate_text_unverified === null
      ? {}
      : { plateTextUnverified: row.plate_text_unverified }),
    reportedAt: row.reported_at.toISOString(),
    state: row.state,
    areaId: row.area_id,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    duplicateCandidates: candidates,
  };
}

export class PostgresReportOpsRepository {
  private readonly policy = new AuthorizationPolicy();

  constructor(
    private readonly pool: Pool,
    private readonly transactions: PostgresTransactionManager,
    private readonly outbox: PostgresOutboxWriter,
  ) {}

  async verificationQueue(
    unresolvedScope: AccessScope,
    areaId: string,
    query: OpsReportVerificationQueueQuery,
  ): Promise<OpsReportVerificationQueue> {
    const scope = requireAccessScope(unresolvedScope);
    this.assertAuthorized(scope, PolicyAction.REPORT_READ, areaId);
    const result = await this.pool.query<ReportRow>(
      `SELECT ${REPORT_COLUMNS}
         FROM report.reports
        WHERE area_id=$1 AND state='PENDING_VERIFICATION'
          AND verification_sequence > $2::bigint
          AND CASE data_class
                WHEN 'public' THEN 0 WHEN 'internal' THEN 1
                WHEN 'sensitive' THEN 2 WHEN 'restricted' THEN 3
              END <= $4
        ORDER BY verification_sequence ASC
        LIMIT $3`,
      [
        areaId,
        query.after,
        query.limit + 1,
        DATA_CLASS_RANK[scope.maxDataClass],
      ],
    );
    const allowed = result.rows.filter((row) =>
      this.isAuthorized(scope, PolicyAction.REPORT_READ, row),
    );
    const hasMore = allowed.length > query.limit;
    const page = allowed.slice(0, query.limit);
    const candidates = await this.loadCandidates(
      this.pool,
      page.map((row) => row.id),
    );
    return {
      items: page.map((row) => ({
        cursor: row.verification_sequence,
        report: mapReport(row, candidates.get(row.id) ?? []),
      })),
      nextCursor: page.at(-1)?.verification_sequence ?? query.after,
      hasMore,
    };
  }

  async decide(
    unresolvedScope: AccessScope,
    areaId: string,
    reportId: string,
    input: OpsReportVerificationDecision,
    traceId: string,
    now = new Date(),
  ): Promise<OpsReport> {
    const scope = requireAccessScope(unresolvedScope);
    this.assertDispatcher(scope, areaId);
    return this.transactions.execute(async (client) => {
      const row = await this.lockReport(client, reportId, areaId);
      if (!this.isAuthorized(scope, PolicyAction.REPORT_VERIFY, row)) {
        throw new ReportOpsFailure("FORBIDDEN", "Report is outside scope");
      }
      let next;
      try {
        next = transitionReport(
          { state: row.state, version: row.version },
          {
            to: input.decision as ReportState,
            actorRole: "DISPATCHER",
            expectedVersion: input.expectedVersion,
            reason: input.reason,
          },
        );
      } catch (error) {
        if (error instanceof ReportRuleViolation) {
          throw new ReportOpsFailure("INVALID_TRANSITION", error.code);
        }
        throw error;
      }

      let confirmedCandidateId: string | undefined;
      if (input.decision === "DUPLICATE") {
        confirmedCandidateId = input.duplicateCandidateId!;
        await this.resolveCandidate(
          client,
          row,
          confirmedCandidateId,
          input.duplicateCandidateExpectedVersion!,
          "CONFIRMED",
          scope.principalId,
          input.reason!,
          now,
        );
      }

      const updated = await client.query<ReportRow>(
        `UPDATE report.reports
            SET state=$2,version=$3,updated_at=$4
          WHERE id=$1
          RETURNING ${REPORT_COLUMNS}`,
        [reportId, next.state, next.version, now],
      );
      await client.query(
        `INSERT INTO report.status_history
           (report_id,from_state,to_state,actor_ref,reason,trace_id,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          reportId,
          row.state,
          next.state,
          scope.principalId,
          input.reason ?? null,
          traceId,
          now,
        ],
      );
      await client.query(
        `INSERT INTO audit.audit_events
           (who,action,object_type,object_id,scope,outcome,trace_id,metadata)
         VALUES ($1,'report.verification.decide','report',$2,$3,'SUCCESS',$4,$5::jsonb)`,
        [
          scope.principalId,
          reportId,
          areaId,
          traceId,
          JSON.stringify({
            from: row.state,
            to: next.state,
            ...(confirmedCandidateId
              ? { duplicate_candidate_id: confirmedCandidateId }
              : {}),
          }),
        ],
      );
      const eventData: ReportVerificationDecidedEventData = {
        report_id: reportId,
        area_id: areaId,
        state: input.decision,
        version: next.version,
      };
      await this.outbox.append(client, {
        event_id: randomUUID(),
        type: EVENT_ROUTING_KEYS.REPORT_VERIFICATION_DECIDED,
        version: 1,
        occurred_at: now.toISOString(),
        trace_id: traceId,
        aggregate_id: reportId,
        aggregate_type: "report",
        data: eventData,
      });
      const candidates = await this.loadCandidates(client, [reportId]);
      return mapReport(updated.rows[0]!, candidates.get(reportId) ?? []);
    });
  }

  async markDuplicateFalsePositive(
    unresolvedScope: AccessScope,
    areaId: string,
    reportId: string,
    candidateId: string,
    input: DuplicateFalsePositiveRequest,
    traceId: string,
    now = new Date(),
  ): Promise<OpsReportDuplicateCandidate> {
    const scope = requireAccessScope(unresolvedScope);
    this.assertDispatcher(scope, areaId);
    return this.transactions.execute(async (client) => {
      const row = await this.lockReport(client, reportId, areaId);
      if (
        row.state !== ReportState.PENDING_VERIFICATION ||
        !this.isAuthorized(scope, PolicyAction.REPORT_VERIFY, row)
      ) {
        throw new ReportOpsFailure(
          row.state === ReportState.PENDING_VERIFICATION
            ? "FORBIDDEN"
            : "INVALID_TRANSITION",
          "Duplicate suggestion cannot be overridden",
        );
      }
      const candidate = await this.resolveCandidate(
        client,
        row,
        candidateId,
        input.expectedVersion,
        "FALSE_POSITIVE",
        scope.principalId,
        input.reason,
        now,
      );
      await client.query(
        `INSERT INTO audit.audit_events
           (who,action,object_type,object_id,scope,outcome,trace_id,metadata)
         VALUES ($1,'report.duplicate.false_positive','duplicate_candidate',$2,$3,'SUCCESS',$4,$5::jsonb)`,
        [
          scope.principalId,
          candidateId,
          areaId,
          traceId,
          JSON.stringify({ report_id: reportId }),
        ],
      );
      const eventData: ReportDuplicateFalsePositiveEventData = {
        report_id: reportId,
        candidate_id: candidateId,
        area_id: areaId,
        candidate_version: candidate.version,
      };
      await this.outbox.append(client, {
        event_id: randomUUID(),
        type: EVENT_ROUTING_KEYS.REPORT_DUPLICATE_FALSE_POSITIVE,
        version: 1,
        occurred_at: now.toISOString(),
        trace_id: traceId,
        aggregate_id: reportId,
        aggregate_type: "report",
        data: eventData,
      });
      return mapCandidate(candidate);
    });
  }

  private async lockReport(
    client: PoolClient,
    reportId: string,
    areaId: string,
  ): Promise<ReportRow> {
    const result = await client.query<ReportRow>(
      `SELECT ${REPORT_COLUMNS}
         FROM report.reports WHERE id=$1 AND area_id=$2 FOR UPDATE`,
      [reportId, areaId],
    );
    const row = result.rows[0];
    if (!row) throw new ReportOpsFailure("NOT_FOUND", "Report not found");
    return row;
  }

  private async resolveCandidate(
    client: PoolClient,
    report: ReportRow,
    candidateId: string,
    expectedVersion: number,
    status: "CONFIRMED" | "FALSE_POSITIVE",
    principalId: string,
    reason: string,
    now: Date,
  ): Promise<CandidateRow> {
    const selected = await client.query<CandidateRow>(
      `SELECT id,report_id,candidate_report_id,signals,status,observed_at,version
         FROM report.duplicate_candidates
        WHERE id=$1 AND report_id=$2
        FOR UPDATE`,
      [candidateId, report.id],
    );
    const candidate = selected.rows[0];
    if (
      !candidate ||
      candidate.status !== "PENDING" ||
      candidate.version !== expectedVersion
    ) {
      throw new ReportOpsFailure(
        "CANDIDATE_CONFLICT",
        "Duplicate candidate is unavailable or stale",
      );
    }
    const updated = await client.query<CandidateRow>(
      `UPDATE report.duplicate_candidates
          SET status=$2,version=version+1,resolved_by=$3,
              resolution_reason=$4,resolved_at=$5
        WHERE id=$1
        RETURNING id,report_id,candidate_report_id,signals,status,observed_at,version`,
      [candidateId, status, principalId, reason, now],
    );
    return updated.rows[0]!;
  }

  private async loadCandidates(
    queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">,
    reportIds: string[],
  ): Promise<Map<string, OpsReportDuplicateCandidate[]>> {
    const grouped = new Map<string, OpsReportDuplicateCandidate[]>();
    if (reportIds.length === 0) return grouped;
    const result = await queryable.query<CandidateRow>(
      `SELECT id,report_id,candidate_report_id,signals,status,observed_at,version
         FROM report.duplicate_candidates
        WHERE report_id=ANY($1::uuid[])
        ORDER BY created_at ASC,id ASC`,
      [reportIds],
    );
    for (const row of result.rows) {
      const group = grouped.get(row.report_id) ?? [];
      group.push(mapCandidate(row));
      grouped.set(row.report_id, group);
    }
    return grouped;
  }

  private assertDispatcher(scope: AccessScope, areaId: string): void {
    if (scope.role !== OfficerRole.DISPATCHER) {
      throw new ReportOpsFailure("FORBIDDEN", "Dispatcher role required");
    }
    this.assertAuthorized(scope, PolicyAction.REPORT_VERIFY, areaId);
  }

  private assertAuthorized(
    scope: AccessScope,
    action: PolicyAction,
    areaId: string,
  ): void {
    const result = this.policy.evaluate(scope, {
      action,
      resource: { areaId, dataClass: DataClass.SENSITIVE },
    });
    if (!result.allowed) {
      throw new ReportOpsFailure("FORBIDDEN", "Report area is outside scope");
    }
  }

  private isAuthorized(
    scope: AccessScope,
    action: PolicyAction,
    row: ReportRow,
  ): boolean {
    return this.policy.evaluate(scope, {
      action,
      resource: {
        areaId: row.area_id,
        dataClass: row.data_class,
      },
    }).allowed;
  }
}
