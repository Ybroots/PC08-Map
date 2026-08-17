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
  EMERGENCY_CONTACTS,
  EVENT_ROUTING_KEYS,
  SosAcceptedSchema,
  type CreateSosDto,
  type IncidentReceivedEventData,
  type OpsIncident,
  type OpsIncidentFeed,
  type OpsIncidentFeedQuery,
  type OpsIncidentTransitionRequest,
  type PublicIncidentTracking,
  type SosAcceptedDto,
} from "@atgt/contracts";
import {
  IncidentRuleViolation,
  IncidentState,
  PublicCode,
  toPublicIncidentStatus,
  transitionIncident,
} from "@atgt/domain";
import type { Pool, PoolClient } from "pg";
import { PostgresOutboxWriter } from "../../platform/database";
import { PostgresTransactionManager } from "../../platform/database/transaction-manager";
import { hashRequest } from "../../platform/idempotency/request-hash";
import type { JsonValue } from "../../platform/idempotency/idempotency.types";

interface IncidentRow {
  id: string;
  public_code: string;
  type: string;
  priority: OpsIncident["priority"];
  longitude: number;
  latitude: number;
  accuracy_m: string;
  description: string | null;
  occurred_at: Date;
  state: IncidentState;
  area_id: string;
  data_class: DataClass;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface IdempotencyRow {
  request_hash: string;
  state: "PROCESSING" | "COMPLETED";
  response_status: number | null;
  response_body: unknown;
}

interface FeedRow extends IncidentRow {
  feed_sequence: string;
  from_state: IncidentState | null;
  to_state: IncidentState;
  changed_at: Date;
}

export type IncidentFailureCode =
  | "CONFIGURATION_BLOCKED"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "INCIDENT_TYPE_UNAVAILABLE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_TRANSITION";

export class IncidentFailure extends Error {
  constructor(
    readonly code: IncidentFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "IncidentFailure";
  }
}

export interface SosIntakePolicy {
  enabled: boolean;
  intakeAreaId?: string;
  idempotencyTtlMinutes?: number;
}

export interface AcceptedSosResult {
  response: SosAcceptedDto;
  replayed: boolean;
}

function mapIncident(row: IncidentRow): OpsIncident {
  return {
    id: row.id,
    publicCode: row.public_code.trim(),
    incidentType: row.type,
    priority: row.priority,
    coordinateLongitude: row.longitude,
    coordinateLatitude: row.latitude,
    accuracyMeters: Number(row.accuracy_m),
    ...(row.description === null ? {} : { description: row.description }),
    occurredAt: row.occurred_at.toISOString(),
    receivedAt: row.created_at.toISOString(),
    state: row.state,
    areaId: row.area_id,
    version: row.version,
  };
}

function requestValue(input: CreateSosDto): JsonValue {
  return {
    coordinateLongitude: input.coordinateLongitude,
    coordinateLatitude: input.coordinateLatitude,
    accuracyMeters: input.accuracyMeters,
    incidentType: input.incidentType,
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    clientEventAt: input.clientEventAt,
  };
}

const DATA_CLASS_RANK: Readonly<Record<DataClass, number>> = {
  [DataClass.PUBLIC]: 0,
  [DataClass.INTERNAL]: 1,
  [DataClass.SENSITIVE]: 2,
  [DataClass.RESTRICTED]: 3,
};

export class PostgresIncidentRepository {
  private readonly policy = new AuthorizationPolicy();

  constructor(
    private readonly pool: Pool,
    private readonly transactions: PostgresTransactionManager,
    private readonly outbox: PostgresOutboxWriter,
    private readonly intakePolicy: SosIntakePolicy,
  ) {}

  async acceptSos(
    input: CreateSosDto,
    idempotencyKey: string,
    traceId: string,
    now = new Date(),
  ): Promise<AcceptedSosResult> {
    const { enabled, intakeAreaId, idempotencyTtlMinutes } = this.intakePolicy;
    if (!enabled || !intakeAreaId || !idempotencyTtlMinutes) {
      throw new IncidentFailure(
        "CONFIGURATION_BLOCKED",
        "SOS intake is not configured for this deployment",
      );
    }
    const storageKey = `sos:${idempotencyKey}`;
    const requestHash = hashRequest(requestValue(input));
    const expiresAt = new Date(now.getTime() + idempotencyTtlMinutes * 60_000);

    return this.transactions.execute(async (client) => {
      await client.query(
        `DELETE FROM platform.idempotency_keys
          WHERE idempotency_key = $1 AND expires_at <= $2`,
        [storageKey, now],
      );
      const claimed = await client.query(
        `INSERT INTO platform.idempotency_keys
           (idempotency_key, request_hash, state, expires_at)
         VALUES ($1,$2,'PROCESSING',$3)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [storageKey, requestHash, expiresAt],
      );
      if (claimed.rowCount !== 1) {
        const existing = await client.query<IdempotencyRow>(
          `SELECT request_hash,state,response_status,response_body
             FROM platform.idempotency_keys
            WHERE idempotency_key = $1`,
          [storageKey],
        );
        const row = existing.rows[0];
        if (!row || row.state === "PROCESSING") {
          throw new IncidentFailure(
            "IDEMPOTENCY_IN_PROGRESS",
            "The SOS request is still processing",
          );
        }
        if (row.request_hash !== requestHash) {
          throw new IncidentFailure(
            "IDEMPOTENCY_CONFLICT",
            "The key was already used for another SOS payload",
          );
        }
        return {
          response: SosAcceptedSchema.parse(row.response_body),
          replayed: true,
        };
      }

      const catalog = await client.query<{
        priority: OpsIncident["priority"];
      }>(
        `SELECT priority
           FROM incident.incident_type_catalog
          WHERE code = $1 AND enabled = true`,
        [input.incidentType],
      );
      const priority = catalog.rows[0]?.priority;
      if (!priority) {
        throw new IncidentFailure(
          "INCIDENT_TYPE_UNAVAILABLE",
          "The incident type is unavailable",
        );
      }

      const incidentId = randomUUID();
      const publicCode = PublicCode.generate().toString();
      const inserted = await client.query<{ created_at: Date }>(
        `INSERT INTO incident.incidents
           (id,public_code,type,priority,longitude,latitude,accuracy_m,
            description,occurred_at,state,source,area_id,data_class)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RECEIVED','WEB',$10,'sensitive')
         RETURNING created_at`,
        [
          incidentId,
          publicCode,
          input.incidentType,
          priority,
          input.coordinateLongitude,
          input.coordinateLatitude,
          input.accuracyMeters,
          input.description ?? null,
          new Date(input.clientEventAt),
          intakeAreaId,
        ],
      );
      const receivedAt = inserted.rows[0]!.created_at;
      await client.query(
        `INSERT INTO incident.status_history
           (incident_id,from_state,to_state,actor_ref,trace_id,created_at)
         VALUES ($1,NULL,'RECEIVED','public-sos',$2,$3)`,
        [incidentId, traceId, receivedAt],
      );
      await client.query(
        `INSERT INTO audit.audit_events
           (who,action,object_type,object_id,scope,outcome,trace_id,metadata)
         VALUES ('public','incident.sos.accept','incident',$1,$2,'SUCCESS',$3,$4::jsonb)`,
        [
          incidentId,
          intakeAreaId,
          traceId,
          JSON.stringify({
            incident_type: input.incidentType,
            priority,
            source: "WEB",
          }),
        ],
      );
      const eventData: IncidentReceivedEventData = {
        incident_id: incidentId,
        incident_type: input.incidentType,
        priority,
        area_id: intakeAreaId,
        state: "RECEIVED",
      };
      await this.outbox.append(client, {
        event_id: randomUUID(),
        type: EVENT_ROUTING_KEYS.INCIDENT_RECEIVED,
        version: 1,
        occurred_at: receivedAt.toISOString(),
        trace_id: traceId,
        aggregate_id: incidentId,
        aggregate_type: "incident",
        data: eventData,
      });
      const response: SosAcceptedDto = {
        publicCode,
        status: "RECEIVED",
        receivedAt: receivedAt.toISOString(),
        emergencyContacts: EMERGENCY_CONTACTS.map((contact) => ({
          ...contact,
        })),
      };
      const completed = await client.query(
        `UPDATE platform.idempotency_keys
            SET state='COMPLETED',response_status=202,response_body=$3::jsonb,
                updated_at=$4
          WHERE idempotency_key=$1 AND request_hash=$2 AND state='PROCESSING'`,
        [storageKey, requestHash, JSON.stringify(response), now],
      );
      if (completed.rowCount !== 1) {
        throw new Error("SOS idempotency completion invariant failed");
      }
      return { response, replayed: false };
    });
  }

  async publicTracking(publicCode: string): Promise<PublicIncidentTracking> {
    if (!PublicCode.isValid(publicCode)) {
      throw new IncidentFailure("NOT_FOUND", "Case not found");
    }
    const result = await this.pool.query<
      Pick<IncidentRow, "public_code" | "state" | "created_at" | "updated_at">
    >(
      `SELECT public_code,state,created_at,updated_at
         FROM incident.incidents
        WHERE public_code=$1
        LIMIT 1`,
      [publicCode.toUpperCase()],
    );
    const row = result.rows[0];
    if (!row) throw new IncidentFailure("NOT_FOUND", "Case not found");
    return {
      publicCode: row.public_code.trim(),
      status: toPublicIncidentStatus(row.state),
      receivedAt: row.created_at.toISOString(),
      lastUpdatedAt: row.updated_at.toISOString(),
    };
  }

  async feed(
    unresolvedScope: AccessScope,
    areaId: string,
    query: OpsIncidentFeedQuery,
  ): Promise<OpsIncidentFeed> {
    const scope = requireAccessScope(unresolvedScope);
    this.assertAuthorized(scope, PolicyAction.INCIDENT_READ, areaId);
    const result = await this.pool.query<FeedRow>(
      `SELECT h.feed_sequence::text,h.from_state,h.to_state,
              h.created_at AS changed_at,
              i.id,i.public_code,i.type,i.priority,i.longitude,i.latitude,
              i.accuracy_m,i.description,i.occurred_at,i.state,i.area_id,
              i.data_class,i.version,i.created_at,i.updated_at
         FROM incident.status_history h
         JOIN incident.incidents i ON i.id=h.incident_id
        WHERE i.area_id=$1 AND h.feed_sequence > $2::bigint
          AND CASE i.data_class
                WHEN 'public' THEN 0 WHEN 'internal' THEN 1
                WHEN 'sensitive' THEN 2 WHEN 'restricted' THEN 3
              END <= $4
        ORDER BY h.feed_sequence ASC
        LIMIT $3`,
      [
        areaId,
        query.after,
        query.limit + 1,
        DATA_CLASS_RANK[scope.maxDataClass],
      ],
    );
    const allowed = result.rows.filter((row) =>
      this.isAuthorized(
        scope,
        PolicyAction.INCIDENT_READ,
        row.area_id,
        row.data_class,
      ),
    );
    const hasMore = allowed.length > query.limit;
    const page = allowed.slice(0, query.limit);
    return {
      items: page.map((row) => ({
        cursor: row.feed_sequence,
        fromState: row.from_state,
        toState: row.to_state,
        changedAt: row.changed_at.toISOString(),
        incident: mapIncident(row),
      })),
      nextCursor: page.at(-1)?.feed_sequence ?? query.after,
      hasMore,
    };
  }

  async transition(
    incidentId: string,
    areaId: string,
    unresolvedScope: AccessScope,
    input: OpsIncidentTransitionRequest,
    traceId: string,
  ): Promise<OpsIncident> {
    const scope = requireAccessScope(unresolvedScope);
    if (scope.role !== OfficerRole.DISPATCHER) {
      throw new IncidentFailure(
        "FORBIDDEN",
        "Only a scoped dispatcher may perform T07 verification transitions",
      );
    }
    return this.transactions.execute(async (client) => {
      const selected = await client.query<IncidentRow>(
        `SELECT id,public_code,type,priority,longitude,latitude,accuracy_m,
                description,occurred_at,state,area_id,data_class,version,
                created_at,updated_at
           FROM incident.incidents
          WHERE id=$1 AND area_id=$2
          FOR UPDATE`,
        [incidentId, areaId],
      );
      const row = selected.rows[0];
      if (!row) throw new IncidentFailure("NOT_FOUND", "Incident not found");
      if (
        !this.isAuthorized(
          scope,
          PolicyAction.INCIDENT_UPDATE_STATUS,
          row.area_id,
          row.data_class,
        )
      ) {
        throw new IncidentFailure("FORBIDDEN", "Incident is outside scope");
      }
      let next;
      try {
        next = transitionIncident(
          { state: row.state, version: row.version },
          {
            to: input.toState as IncidentState,
            expectedVersion: input.expectedVersion,
            actorRole: "DISPATCHER",
            reason: input.reason,
          },
        );
      } catch (error) {
        if (error instanceof IncidentRuleViolation) {
          throw new IncidentFailure("INVALID_TRANSITION", error.code);
        }
        throw error;
      }
      const updated = await client.query<IncidentRow>(
        `UPDATE incident.incidents
            SET state=$2,version=$3,updated_at=NOW()
          WHERE id=$1
          RETURNING id,public_code,type,priority,longitude,latitude,accuracy_m,
                    description,occurred_at,state,area_id,data_class,version,
                    created_at,updated_at`,
        [incidentId, next.state, next.version],
      );
      await client.query(
        `INSERT INTO incident.status_history
           (incident_id,from_state,to_state,actor_ref,reason,trace_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          incidentId,
          row.state,
          next.state,
          scope.principalId,
          input.reason ?? null,
          traceId,
        ],
      );
      await client.query(
        `INSERT INTO audit.audit_events
           (who,action,object_type,object_id,scope,outcome,trace_id,metadata)
         VALUES ($1,'incident.transition','incident',$2,$3,'SUCCESS',$4,$5::jsonb)`,
        [
          scope.principalId,
          incidentId,
          areaId,
          traceId,
          JSON.stringify({ from: row.state, to: next.state }),
        ],
      );
      if (next.state === IncidentState.VERIFIED) {
        await this.appendVerifiedEvent(client, row, traceId);
      }
      return mapIncident(updated.rows[0]!);
    });
  }

  private assertAuthorized(
    scope: AccessScope,
    action: PolicyAction,
    areaId: string,
  ): void {
    if (!this.isAuthorized(scope, action, areaId, DataClass.SENSITIVE)) {
      throw new IncidentFailure("FORBIDDEN", "Incident area is outside scope");
    }
  }

  private isAuthorized(
    scope: AccessScope,
    action: PolicyAction,
    areaId: string,
    dataClass: DataClass,
    caseId?: string,
  ): boolean {
    return this.policy.evaluate(scope, {
      action,
      resource: { areaId, dataClass, caseId },
    }).allowed;
  }

  private async appendVerifiedEvent(
    client: PoolClient,
    row: IncidentRow,
    traceId: string,
  ): Promise<void> {
    await this.outbox.append(client, {
      event_id: randomUUID(),
      type: EVENT_ROUTING_KEYS.INCIDENT_VERIFIED,
      version: 1,
      occurred_at: new Date().toISOString(),
      trace_id: traceId,
      aggregate_id: row.id,
      aggregate_type: "incident",
      data: {
        incident_id: row.id,
        incident_type: row.type,
        priority: row.priority,
        area_id: row.area_id,
        state: "VERIFIED",
      },
    });
  }
}
