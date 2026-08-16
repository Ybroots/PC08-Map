import { EventEnvelopeSchema, type EventEnvelope } from "@atgt/contracts";
import type { QueryExecutor } from "./database.types";

export interface InboxStore {
  claim(
    client: QueryExecutor,
    consumerName: string,
    event: EventEnvelope,
  ): Promise<boolean>;
}

export class PostgresInboxStore implements InboxStore {
  async claim(
    client: QueryExecutor,
    consumerName: string,
    event: EventEnvelope,
  ): Promise<boolean> {
    const parsed = EventEnvelopeSchema.parse(event);
    const normalizedConsumerName = consumerName.trim();
    if (
      normalizedConsumerName.length === 0 ||
      normalizedConsumerName.length > 100
    ) {
      throw new Error("consumerName must be between 1 and 100 characters");
    }
    const result = await client.query(
      `INSERT INTO platform.inbox_messages
         (consumer_name, message_id, event_type, trace_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (consumer_name, message_id) DO NOTHING
       RETURNING message_id`,
      [normalizedConsumerName, parsed.event_id, parsed.type, parsed.trace_id],
    );
    return result.rowCount === 1;
  }
}
