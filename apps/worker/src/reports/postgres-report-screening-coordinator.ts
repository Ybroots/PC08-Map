import { randomUUID } from "node:crypto";
import {
  EVENT_ROUTING_KEYS,
  type ReportDuplicateCandidateCreatedEventData,
  type ReportScreeningCompletedEventData,
} from "@atgt/contracts";
import {
  ReportState,
  transitionReport,
  type ReportSnapshot,
} from "@atgt/domain";
import type { Pool, PoolClient } from "pg";
import {
  ReportScreeningFailure,
  type ReportScreeningCoordinatorPort,
  type ReportScreeningEvent,
} from "./report-screening.types";

interface ReportRow extends ReportSnapshot {
  id: string;
  area_id: string;
  category_code: string;
  created_at: Date;
}

interface CandidateReportRow {
  candidate_report_id: string;
  created_at: Date;
}

const CONSUMER_NAME = "report-screening-worker";
const ACTOR_REF = "system:report-screening";
const HASH_SOURCE_REF = "exact-evidence-sha256-v1";

export class PostgresReportScreeningCoordinator implements ReportScreeningCoordinatorPort {
  constructor(private readonly pool: Pool) {}

  async process(
    event: ReportScreeningEvent,
    maxCandidatesPerReport: number,
  ): Promise<"PROCESSED" | "DUPLICATE"> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query(
        `INSERT INTO platform.inbox_messages
           (consumer_name,message_id,event_type,trace_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (consumer_name,message_id) DO NOTHING
         RETURNING message_id`,
        [CONSUMER_NAME, event.event_id, event.type, event.trace_id],
      );
      if (claimed.rowCount !== 1) {
        await client.query("COMMIT");
        return "DUPLICATE";
      }

      const selected = await client.query<ReportRow>(
        `SELECT id,area_id,category_code,state,version,created_at
           FROM report.reports
          WHERE id=$1
          FOR UPDATE`,
        [event.data.report_id],
      );
      const report = selected.rows[0];
      if (!report) {
        throw new ReportScreeningFailure("REPORT_NOT_FOUND", false);
      }
      if (
        event.data.area_id !== report.area_id ||
        (event.type === EVENT_ROUTING_KEYS.REPORT_RECEIVED &&
          event.data.category_code !== report.category_code)
      ) {
        throw new ReportScreeningFailure("EVENT_REPORT_MISMATCH", false);
      }
      const clock = await client.query<{ now: Date }>(
        "SELECT clock_timestamp() AS now",
      );
      const now = clock.rows[0]!.now;
      const screeningApplied = await this.advanceToPending(
        client,
        report,
        event.trace_id,
        now,
      );

      if (
        event.type === EVENT_ROUTING_KEYS.REPORT_EVIDENCE_LINKED &&
        report.state === ReportState.PENDING_VERIFICATION
      ) {
        await this.createExactHashCandidates(
          client,
          report,
          event.data.evidence_id,
          event.trace_id,
          now,
          maxCandidatesPerReport,
        );
      }

      if (screeningApplied) {
        await this.persistScreeningCompleted(
          client,
          report,
          event.trace_id,
          now,
        );
      }
      await client.query("COMMIT");
      return "PROCESSED";
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async advanceToPending(
    client: PoolClient,
    report: ReportRow,
    traceId: string,
    now: Date,
  ): Promise<boolean> {
    let changed = false;
    if (report.state === ReportState.RECEIVED) {
      const next = transitionReport(report, {
        to: ReportState.SCREENING,
        actorRole: "SYSTEM",
        expectedVersion: report.version,
      });
      await this.applyState(client, report, next, traceId, now);
      changed = true;
    }
    if (report.state === ReportState.SCREENING) {
      const next = transitionReport(report, {
        to: ReportState.PENDING_VERIFICATION,
        actorRole: "SYSTEM",
        expectedVersion: report.version,
      });
      await this.applyState(client, report, next, traceId, now);
      changed = true;
    }
    return changed;
  }

  private async applyState(
    client: PoolClient,
    report: ReportRow,
    next: ReportSnapshot,
    traceId: string,
    now: Date,
  ): Promise<void> {
    const from = report.state;
    const updated = await client.query(
      `UPDATE report.reports
          SET state=$2,version=$3,updated_at=$4
        WHERE id=$1 AND version=$5`,
      [report.id, next.state, next.version, now, report.version],
    );
    if (updated.rowCount !== 1) {
      throw new ReportScreeningFailure("REPORT_STATE_CONFLICT", true);
    }
    await client.query(
      `INSERT INTO report.status_history
         (report_id,from_state,to_state,actor_ref,trace_id,created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [report.id, from, next.state, ACTOR_REF, traceId, now],
    );
    report.state = next.state;
    report.version = next.version;
  }

  private async persistScreeningCompleted(
    client: PoolClient,
    report: ReportRow,
    traceId: string,
    now: Date,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit.audit_events
         (who,action,object_type,object_id,scope,outcome,trace_id,metadata)
       VALUES ($1,'report.screening.manual_queue','report',$2,$3,'SUCCESS',$4,$5::jsonb)`,
      [
        ACTOR_REF,
        report.id,
        report.area_id,
        traceId,
        JSON.stringify({
          state: ReportState.PENDING_VERIFICATION,
          mode: "MANUAL_REVIEW_ONLY",
        }),
      ],
    );
    const data: ReportScreeningCompletedEventData = {
      report_id: report.id,
      area_id: report.area_id,
      state: "PENDING_VERIFICATION",
      version: report.version,
      mode: "MANUAL_REVIEW_ONLY",
    };
    await this.appendOutbox(
      client,
      report.id,
      EVENT_ROUTING_KEYS.REPORT_SCREENING_COMPLETED,
      data,
      traceId,
      now,
    );
  }

  private async createExactHashCandidates(
    client: PoolClient,
    report: ReportRow,
    evidenceId: string,
    traceId: string,
    now: Date,
    maxCandidatesPerReport: number,
  ): Promise<void> {
    const target = await client.query<{ sha256: string }>(
      `SELECT sha256
         FROM evidence.objects
        WHERE evidence_id=$1 AND owner_type='report' AND owner_id=$2`,
      [evidenceId, report.id],
    );
    if (!target.rows[0]) {
      throw new ReportScreeningFailure("REPORT_EVIDENCE_NOT_FOUND", false);
    }
    const matches = await client.query<CandidateReportRow>(
      `SELECT DISTINCT r.id AS candidate_report_id,r.created_at
         FROM evidence.objects o
         JOIN report.reports r ON r.id=o.owner_id
        WHERE o.owner_type='report' AND o.owner_id<>$1
          AND o.sha256=$2 AND r.area_id=$3
          AND (r.created_at<$4 OR (r.created_at=$4 AND r.id::text<$1::text))
        ORDER BY r.created_at DESC,r.id ASC
        LIMIT $5`,
      [
        report.id,
        target.rows[0].sha256,
        report.area_id,
        report.created_at,
        maxCandidatesPerReport + 1,
      ],
    );
    if (matches.rows.length > maxCandidatesPerReport) {
      throw new ReportScreeningFailure("CANDIDATE_LIMIT_EXCEEDED", false);
    }
    for (const match of matches.rows) {
      const candidateId = randomUUID();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO report.duplicate_candidates
           (id,report_id,candidate_report_id,signals,observed_at,source_ref)
         VALUES ($1,$2,$3,ARRAY['HASH'],$4,$5)
         ON CONFLICT (report_id,candidate_report_id) DO NOTHING
         RETURNING id`,
        [
          candidateId,
          report.id,
          match.candidate_report_id,
          now,
          HASH_SOURCE_REF,
        ],
      );
      if (inserted.rowCount !== 1) continue;
      await client.query(
        `INSERT INTO audit.audit_events
           (who,action,object_type,object_id,scope,outcome,trace_id,metadata)
         VALUES ($1,'report.duplicate.suggest','duplicate_candidate',$2,$3,
                 'SUCCESS',$4,$5::jsonb)`,
        [
          ACTOR_REF,
          candidateId,
          report.area_id,
          traceId,
          JSON.stringify({
            report_id: report.id,
            candidate_report_id: match.candidate_report_id,
            signals: ["HASH"],
          }),
        ],
      );
      const data: ReportDuplicateCandidateCreatedEventData = {
        report_id: report.id,
        candidate_id: candidateId,
        candidate_report_id: match.candidate_report_id,
        area_id: report.area_id,
        signals: ["HASH"],
      };
      await this.appendOutbox(
        client,
        report.id,
        EVENT_ROUTING_KEYS.REPORT_DUPLICATE_CANDIDATE_CREATED,
        data,
        traceId,
        now,
      );
    }
  }

  private async appendOutbox(
    client: PoolClient,
    reportId: string,
    eventType: string,
    data: Record<string, unknown>,
    traceId: string,
    now: Date,
  ): Promise<void> {
    await client.query(
      `INSERT INTO platform.outbox
         (event_id,aggregate_id,aggregate_type,event_type,payload,
          occurred_at,event_version,trace_id)
       VALUES ($1,$2,'report',$3,$4::jsonb,$5,1,$6)`,
      [randomUUID(), reportId, eventType, JSON.stringify(data), now, traceId],
    );
  }
}
