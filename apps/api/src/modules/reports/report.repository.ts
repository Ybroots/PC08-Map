import { randomUUID } from "node:crypto";
import {
  CitizenReportAcceptedSchema,
  EVENT_ROUTING_KEYS,
  ReportEvidenceLinkedSchema,
  type CitizenReportAccepted,
  type CreateCitizenReport,
  type PublicReportTracking,
  type ReportEvidenceLinked,
  type ReportEvidenceLinkedEventData,
  type ReportReceivedEventData,
} from "@atgt/contracts";
import { PublicCode, ReportState, toPublicReportStatus } from "@atgt/domain";
import type { Pool } from "pg";
import { EvidenceAttachmentService } from "../evidence/evidence-attachment.service";
import {
  PostgresOutboxWriter,
  PostgresTransactionManager,
} from "../../platform/database";
import { hashRequest } from "../../platform/idempotency/request-hash";
import type { JsonValue } from "../../platform/idempotency/idempotency.types";
import {
  deriveReportCapability,
  isValidReportCapability,
} from "./report-capability";

interface IdempotencyRow {
  request_hash: string;
  state: "PROCESSING" | "COMPLETED";
  response_body: unknown;
}

interface TrackingRow {
  public_code: string;
  state: ReportState;
  created_at: Date;
  updated_at: Date;
}

export interface ReportIntakePolicy {
  enabled: boolean;
  intakeAreaId?: string;
  idempotencyTtlMinutes?: number;
  evidenceLinkingEnabled?: boolean;
  capabilitySecret?: string;
}

export interface AcceptedReportResult {
  response: CitizenReportAccepted;
  replayed: boolean;
}

export type ReportFailureCode =
  | "CONFIGURATION_BLOCKED"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "CATEGORY_UNAVAILABLE"
  | "EVIDENCE_UNAVAILABLE"
  | "NOT_FOUND";

export class ReportFailure extends Error {
  constructor(
    readonly code: ReportFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "ReportFailure";
  }
}

function requestValue(input: CreateCitizenReport): JsonValue {
  return {
    categoryCode: input.categoryCode,
    coordinateLongitude: input.coordinateLongitude,
    coordinateLatitude: input.coordinateLatitude,
    description: input.description,
    ...(input.plateTextUnverified === undefined
      ? {}
      : { plateTextUnverified: input.plateTextUnverified }),
    clientReportedAt: input.clientReportedAt,
  };
}

export class PostgresReportRepository {
  constructor(
    private readonly pool: Pool,
    private readonly transactions: PostgresTransactionManager,
    private readonly outbox: PostgresOutboxWriter,
    private readonly policy: ReportIntakePolicy,
    private readonly evidenceAttachments?: EvidenceAttachmentService,
  ) {}

  private acceptedWithCapability(
    response: CitizenReportAccepted,
  ): CitizenReportAccepted {
    const { evidenceLinkingEnabled, capabilitySecret } = this.policy;
    if (!evidenceLinkingEnabled || !capabilitySecret) return response;
    return {
      ...response,
      reportCapability: deriveReportCapability(
        capabilitySecret,
        response.publicCode,
      ),
    };
  }

  async accept(
    input: CreateCitizenReport,
    idempotencyKey: string,
    traceId: string,
    now = new Date(),
  ): Promise<AcceptedReportResult> {
    const { enabled, intakeAreaId, idempotencyTtlMinutes } = this.policy;
    if (!enabled || !intakeAreaId || !idempotencyTtlMinutes) {
      throw new ReportFailure(
        "CONFIGURATION_BLOCKED",
        "Citizen report intake is not configured for this deployment",
      );
    }
    const storageKey = `report:${idempotencyKey}`;
    const requestHash = hashRequest(requestValue(input));
    const expiresAt = new Date(now.getTime() + idempotencyTtlMinutes * 60_000);

    return this.transactions.execute(async (client) => {
      await client.query(
        `DELETE FROM platform.idempotency_keys
          WHERE idempotency_key=$1 AND expires_at <= $2`,
        [storageKey, now],
      );
      const claimed = await client.query(
        `INSERT INTO platform.idempotency_keys
           (idempotency_key,request_hash,state,expires_at)
         VALUES ($1,$2,'PROCESSING',$3)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [storageKey, requestHash, expiresAt],
      );
      if (claimed.rowCount !== 1) {
        const existing = await client.query<IdempotencyRow>(
          `SELECT request_hash,state,response_body
             FROM platform.idempotency_keys
            WHERE idempotency_key=$1`,
          [storageKey],
        );
        const row = existing.rows[0];
        if (!row || row.state === "PROCESSING") {
          throw new ReportFailure(
            "IDEMPOTENCY_IN_PROGRESS",
            "The citizen report request is still processing",
          );
        }
        if (row.request_hash !== requestHash) {
          throw new ReportFailure(
            "IDEMPOTENCY_CONFLICT",
            "The key was already used for another citizen report payload",
          );
        }
        return {
          response: this.acceptedWithCapability(
            CitizenReportAcceptedSchema.parse(row.response_body),
          ),
          replayed: true,
        };
      }

      const category = await client.query(
        `SELECT code FROM report.category_catalog
          WHERE code=$1 AND enabled=true`,
        [input.categoryCode],
      );
      if (category.rowCount !== 1) {
        throw new ReportFailure(
          "CATEGORY_UNAVAILABLE",
          "The selected citizen report category is unavailable",
        );
      }

      const reportId = randomUUID();
      const publicCode = PublicCode.generate().toString();
      const inserted = await client.query<{ created_at: Date }>(
        `INSERT INTO report.reports
           (id,public_code,category_code,longitude,latitude,description,
            plate_text_unverified,reported_at,state,risk_score,area_id,data_class)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'RECEIVED',NULL,$9,'sensitive')
         RETURNING created_at`,
        [
          reportId,
          publicCode,
          input.categoryCode,
          input.coordinateLongitude,
          input.coordinateLatitude,
          input.description,
          input.plateTextUnverified ?? null,
          new Date(input.clientReportedAt),
          intakeAreaId,
        ],
      );
      const receivedAt = inserted.rows[0]!.created_at;
      await client.query(
        `INSERT INTO report.status_history
           (report_id,from_state,to_state,actor_ref,trace_id,created_at)
         VALUES ($1,NULL,'RECEIVED','public-report',$2,$3)`,
        [reportId, traceId, receivedAt],
      );
      await client.query(
        `INSERT INTO audit.audit_events
           (who,action,object_type,object_id,scope,outcome,trace_id,metadata)
         VALUES ('public','report.accept','report',$1,$2,'SUCCESS',$3,$4::jsonb)`,
        [
          reportId,
          intakeAreaId,
          traceId,
          JSON.stringify({
            category_code: input.categoryCode,
            source: "PUBLIC_WEB",
          }),
        ],
      );
      const eventData: ReportReceivedEventData = {
        report_id: reportId,
        category_code: input.categoryCode,
        area_id: intakeAreaId,
        state: "RECEIVED",
      };
      await this.outbox.append(client, {
        event_id: randomUUID(),
        type: EVENT_ROUTING_KEYS.REPORT_RECEIVED,
        version: 1,
        occurred_at: receivedAt.toISOString(),
        trace_id: traceId,
        aggregate_id: reportId,
        aggregate_type: "report",
        data: eventData,
      });
      const response: CitizenReportAccepted = {
        publicCode,
        status: "RECEIVED",
        receivedAt: receivedAt.toISOString(),
      };
      const completed = await client.query(
        `UPDATE platform.idempotency_keys
            SET state='COMPLETED',response_status=202,response_body=$3::jsonb,
                updated_at=GREATEST(updated_at,$4)
          WHERE idempotency_key=$1 AND request_hash=$2 AND state='PROCESSING'`,
        [storageKey, requestHash, JSON.stringify(response), receivedAt],
      );
      if (completed.rowCount !== 1) {
        throw new Error(
          "Citizen report idempotency completion invariant failed",
        );
      }
      return {
        response: this.acceptedWithCapability(response),
        replayed: false,
      };
    });
  }

  async attachEvidence(
    publicCode: string,
    evidenceId: string,
    reportCapability: string,
    uploadCapability: string,
    traceId: string,
    now = new Date(),
  ): Promise<ReportEvidenceLinked> {
    const { evidenceLinkingEnabled, capabilitySecret } = this.policy;
    if (
      !evidenceLinkingEnabled ||
      !capabilitySecret ||
      !this.evidenceAttachments
    ) {
      throw new ReportFailure(
        "CONFIGURATION_BLOCKED",
        "Citizen report evidence linking is not configured",
      );
    }
    if (
      !PublicCode.isValid(publicCode) ||
      !isValidReportCapability(capabilitySecret, publicCode, reportCapability)
    ) {
      throw new ReportFailure("NOT_FOUND", "Citizen report not found");
    }

    return this.transactions.execute(async (client) => {
      const report = await client.query<{ id: string; area_id: string }>(
        `SELECT id,area_id FROM report.reports
          WHERE public_code=$1
          FOR UPDATE`,
        [publicCode.toUpperCase()],
      );
      const row = report.rows[0];
      if (!row)
        throw new ReportFailure("NOT_FOUND", "Citizen report not found");
      const linked = await this.evidenceAttachments!.attachReadyToReport(
        client,
        {
          evidenceId,
          reportId: row.id,
          areaId: row.area_id,
          uploadCapability,
        },
      );
      if (!linked) {
        throw new ReportFailure(
          "EVIDENCE_UNAVAILABLE",
          "Evidence is unavailable for attachment",
        );
      }
      if (linked.attachedNow) {
        await client.query(
          `INSERT INTO audit.audit_events
             (who,action,object_type,object_id,scope,outcome,trace_id,metadata)
           VALUES ('public','report.evidence.attach','report',$1,$2,'SUCCESS',$3,$4::jsonb)`,
          [
            row.id,
            row.area_id,
            traceId,
            JSON.stringify({ evidence_id: evidenceId }),
          ],
        );
        const eventData: ReportEvidenceLinkedEventData = {
          report_id: row.id,
          evidence_id: evidenceId,
          area_id: row.area_id,
        };
        await this.outbox.append(client, {
          event_id: randomUUID(),
          type: EVENT_ROUTING_KEYS.REPORT_EVIDENCE_LINKED,
          version: 1,
          occurred_at: now.toISOString(),
          trace_id: traceId,
          aggregate_id: row.id,
          aggregate_type: "report",
          data: eventData,
        });
      }
      return ReportEvidenceLinkedSchema.parse({
        evidenceId,
        state: "ATTACHED",
      });
    });
  }

  async publicTracking(publicCode: string): Promise<PublicReportTracking> {
    if (!PublicCode.isValid(publicCode)) {
      throw new ReportFailure("NOT_FOUND", "Citizen report not found");
    }
    const result = await this.pool.query<TrackingRow>(
      `SELECT public_code,state,created_at,updated_at
         FROM report.reports
        WHERE public_code=$1
        LIMIT 1`,
      [publicCode.toUpperCase()],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ReportFailure("NOT_FOUND", "Citizen report not found");
    }
    return {
      publicCode: row.public_code.trim(),
      status: toPublicReportStatus(row.state),
      receivedAt: row.created_at.toISOString(),
      lastUpdatedAt: row.updated_at.toISOString(),
    };
  }
}
