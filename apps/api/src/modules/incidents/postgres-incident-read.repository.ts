import {
  AuthorizationPolicy,
  DataClass,
  PolicyAction,
  type AccessScope,
  requireAccessScope,
} from "@atgt/authorization";
import type { QueryExecutor } from "../../platform/database";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface IncidentRow {
  id: string;
  public_code: string;
  type: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  longitude: number;
  latitude: number;
  accuracy_m: string | null;
  description: string | null;
  occurred_at: Date;
  state: string;
  source: "MOBILE_SOS" | "WEB" | "MANUAL";
  area_id: string;
  data_class: DataClass;
  version: number;
  created_at: Date;
  updated_at: Date;
  assigned_unit_id: string | null;
}

export interface IncidentReadModel {
  id: string;
  publicCode: string;
  type: string;
  priority: IncidentRow["priority"];
  location: {
    longitude: number;
    latitude: number;
    accuracyMeters?: number;
  };
  description?: string;
  occurredAt: string;
  state: string;
  source: IncidentRow["source"];
  areaId: string;
  dataClass: DataClass;
  version: number;
  assignedUnitId?: string;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: IncidentRow): IncidentReadModel {
  return {
    id: row.id,
    publicCode: row.public_code.trim(),
    type: row.type,
    priority: row.priority,
    location: {
      longitude: row.longitude,
      latitude: row.latitude,
      ...(row.accuracy_m === null
        ? {}
        : { accuracyMeters: Number(row.accuracy_m) }),
    },
    ...(row.description === null ? {} : { description: row.description }),
    occurredAt: row.occurred_at.toISOString(),
    state: row.state,
    source: row.source,
    areaId: row.area_id,
    dataClass: row.data_class,
    version: row.version,
    ...(row.assigned_unit_id === null
      ? {}
      : { assignedUnitId: row.assigned_unit_id }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Defense-in-depth read adapter.
 *
 * Callers cannot omit a resolved scope. SQL first narrows by area/case grants,
 * then the policy engine re-evaluates role, unit, area, case and data class.
 * Denials return null so record existence is not disclosed.
 */
export class PostgresIncidentReadRepository {
  constructor(
    private readonly database: QueryExecutor,
    private readonly policy = new AuthorizationPolicy(),
  ) {}

  async findById(
    unresolvedScope: AccessScope,
    incidentId: string,
  ): Promise<IncidentReadModel | null> {
    const scope = requireAccessScope(unresolvedScope);
    if (!UUID_PATTERN.test(incidentId)) return null;
    if (scope.areaIds.length === 0 && scope.assignedCaseIds.length === 0) {
      return null;
    }

    const result = await this.database.query<IncidentRow>(
      `SELECT i.id, i.public_code, i.type, i.priority, i.longitude, i.latitude,
              i.accuracy_m, i.description, i.occurred_at, i.state, i.source,
              i.area_id, i.data_class, i.version, i.created_at, i.updated_at,
              active_assignment.unit_id::text AS assigned_unit_id
       FROM incident.incidents i
       LEFT JOIN LATERAL (
         SELECT a.unit_id
         FROM dispatch.assignments a
         WHERE a.incident_id = i.id
           AND a.ended_at IS NULL
         ORDER BY a.assigned_at DESC
         LIMIT 1
       ) active_assignment ON true
       WHERE i.id = $1::uuid
         AND (
           i.area_id = ANY($2::text[])
           OR i.id::text = ANY($3::text[])
         )
       LIMIT 1`,
      [incidentId, [...scope.areaIds], [...scope.assignedCaseIds]],
    );
    const row = result.rows[0];
    if (!row) return null;

    const decision = this.policy.evaluate(scope, {
      action: PolicyAction.INCIDENT_READ,
      resource: {
        dataClass: row.data_class,
        areaId: row.area_id,
        caseId: row.id,
        ...(row.assigned_unit_id === null
          ? {}
          : { unitId: row.assigned_unit_id }),
      },
    });
    return decision.allowed ? mapRow(row) : null;
  }
}
