import type { Pool } from "pg";
import type { SecurityAuditEvent, SecurityAuditSink } from "./identity.types";

export class PostgresSecurityAuditSink implements SecurityAuditSink {
  constructor(private readonly pool: Pool) {}

  async record(event: SecurityAuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit.audit_events
         (who, action, object_type, object_id, scope, outcome, reason, trace_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        event.principalId,
        `${event.category.toLowerCase()}.${event.action}`,
        event.resourceType,
        event.resourceId,
        event.scope ?? null,
        event.outcome,
        event.reason ?? null,
        event.traceId,
        JSON.stringify(event.metadata ?? {}),
      ],
    );
  }
}

export class InMemorySecurityAuditSink implements SecurityAuditSink {
  readonly events: SecurityAuditEvent[] = [];

  async record(event: SecurityAuditEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }
}
