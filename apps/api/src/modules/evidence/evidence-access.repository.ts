import {
  AuthorizationPolicy,
  DataClass,
  PolicyAction,
  requireAccessScope,
  type AccessScope,
} from "@atgt/authorization";
import type { Pool } from "pg";
import type {
  EvidenceAccessKind,
  EvidenceAccessRecord,
  EvidenceAccessRepositoryPort,
} from "./evidence-access.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface EvidenceAccessRow {
  evidence_id: string;
  original_object_key: string;
  derivative_object_key: string;
  mime: string;
  data_class: DataClass;
}

export class PostgresEvidenceAccessRepository implements EvidenceAccessRepositoryPort {
  constructor(
    private readonly pool: Pool,
    private readonly policy = new AuthorizationPolicy(),
  ) {}

  async findScoped(
    unresolvedScope: AccessScope,
    areaId: string,
    caseId: string,
    evidenceId: string,
  ): Promise<EvidenceAccessRecord | null> {
    const scope = requireAccessScope(unresolvedScope);
    if (!UUID_PATTERN.test(caseId) || !UUID_PATTERN.test(evidenceId))
      return null;
    if (
      !scope.areaIds.includes(areaId) ||
      !scope.assignedCaseIds.includes(caseId)
    ) {
      return null;
    }
    const result = await this.pool.query<EvidenceAccessRow>(
      `SELECT o.evidence_id,o.original_object_key,o.derivative_object_key,
              o.mime,o.data_class
         FROM evidence.objects o
         JOIN evidence.uploads u ON u.upload_id=o.evidence_id
        WHERE o.evidence_id=$1::uuid
          AND o.owner_id=$2::uuid
          AND o.area_id=$3
          AND o.owner_type IN ('incident','report')
          AND u.state='READY'
          AND o.area_id=ANY($4::text[])
          AND o.owner_id::text=ANY($5::text[])
        LIMIT 1`,
      [
        evidenceId,
        caseId,
        areaId,
        [...scope.areaIds],
        [...scope.assignedCaseIds],
      ],
    );
    const row = result.rows[0];
    if (!row) return null;
    const decision = this.policy.evaluate(scope, {
      action: PolicyAction.EVIDENCE_VIEW,
      resource: {
        dataClass: row.data_class,
        areaId,
        caseId,
      },
    });
    if (!decision.allowed) return null;
    return {
      evidenceId: row.evidence_id,
      originalObjectKey: row.original_object_key,
      derivativeObjectKey: row.derivative_object_key,
      originalMime: row.mime,
      dataClass: row.data_class,
    };
  }

  async recordAccess(input: {
    scope: AccessScope;
    evidenceId: string;
    areaId: string;
    kind: EvidenceAccessKind;
    outcome: "SUCCESS" | "DENIED" | "ERROR";
    reason?: "NOT_FOUND_OR_SCOPE_MISMATCH" | "STORAGE_UNAVAILABLE";
    traceId: string;
  }): Promise<void> {
    const scope = requireAccessScope(input.scope);
    await this.pool.query(
      `INSERT INTO audit.audit_events
         (who,action,object_type,object_id,scope,outcome,reason,trace_id,metadata)
       VALUES ($1,$2,'evidence',$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        scope.principalId,
        input.kind === "PREVIEW"
          ? "evidence.preview.issue"
          : "evidence.download.issue",
        input.evidenceId,
        input.areaId,
        input.outcome,
        input.reason ?? null,
        input.traceId,
        JSON.stringify({ access_kind: input.kind }),
      ],
    );
  }
}
