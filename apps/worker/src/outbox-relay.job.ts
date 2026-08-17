import { EventEnvelopeSchema, type EventEnvelope } from "@atgt/contracts";
import type { Pool } from "pg";
import type { EventPublisherPort } from "./event-publisher";

interface OutboxRow {
  event_id: string;
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
  event_version: number | null;
  trace_id: string | null;
}

export interface OutboxRelayResult {
  published: number;
  failed: number;
  skipped: boolean;
}

export class OutboxRelayJob {
  constructor(
    private readonly pool: Pool,
    private readonly publisher: EventPublisherPort,
    private readonly batchSize: number,
  ) {}

  async runOnce(): Promise<OutboxRelayResult> {
    const client = await this.pool.connect();
    let locked = false;
    try {
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext('atgt-outbox-relay')) AS acquired",
      );
      locked = lock.rows[0]?.acquired === true;
      if (!locked) return { published: 0, failed: 0, skipped: true };

      const pending = await client.query<OutboxRow>(
        `SELECT event_id,aggregate_id,aggregate_type,event_type,payload,
                occurred_at,event_version,trace_id
           FROM platform.outbox
          WHERE published_at IS NULL
          ORDER BY occurred_at,event_id
          LIMIT $1`,
        [this.batchSize],
      );
      let published = 0;
      let failed = 0;
      for (const row of pending.rows) {
        let event: EventEnvelope;
        try {
          event = EventEnvelopeSchema.parse({
            event_id: row.event_id,
            type: row.event_type,
            version: row.event_version,
            occurred_at: row.occurred_at.toISOString(),
            trace_id: row.trace_id,
            aggregate_id: row.aggregate_id,
            aggregate_type: row.aggregate_type,
            data: row.payload,
          });
        } catch {
          failed += 1;
          await client.query(
            `UPDATE platform.outbox
                SET publish_attempts=publish_attempts+1,
                    last_error='INVALID_EVENT_ENVELOPE'
              WHERE event_id=$1 AND published_at IS NULL`,
            [row.event_id],
          );
          continue;
        }
        try {
          await this.publisher.publish(event);
          const marked = await client.query(
            `UPDATE platform.outbox
                SET published_at=NOW(),publish_attempts=publish_attempts+1,
                    last_error=NULL
              WHERE event_id=$1 AND published_at IS NULL`,
            [row.event_id],
          );
          if (marked.rowCount === 1) published += 1;
        } catch {
          failed += 1;
          await client.query(
            `UPDATE platform.outbox
                SET publish_attempts=publish_attempts+1,
                    last_error='PUBLISH_FAILED'
              WHERE event_id=$1 AND published_at IS NULL`,
            [row.event_id],
          );
        }
      }
      return { published, failed, skipped: false };
    } finally {
      if (locked) {
        await client.query(
          "SELECT pg_advisory_unlock(hashtext('atgt-outbox-relay'))",
        );
      }
      client.release();
    }
  }
}
