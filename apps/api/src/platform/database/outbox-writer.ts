import { EventEnvelopeSchema, type EventEnvelope } from "@atgt/contracts";
import type { QueryExecutor } from "./database.types";

export interface OutboxWriter {
  append(client: QueryExecutor, event: EventEnvelope): Promise<void>;
}

export class PostgresOutboxWriter implements OutboxWriter {
  async append(client: QueryExecutor, event: EventEnvelope): Promise<void> {
    const parsed = EventEnvelopeSchema.parse(event);
    await client.query(
      `INSERT INTO platform.outbox
         (event_id, aggregate_id, aggregate_type, event_type, payload,
          occurred_at, event_version, trace_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        parsed.event_id,
        parsed.aggregate_id,
        parsed.aggregate_type,
        parsed.type,
        JSON.stringify(parsed.data),
        new Date(parsed.occurred_at),
        parsed.version,
        parsed.trace_id,
      ],
    );
  }
}
