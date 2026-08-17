import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "@atgt/contracts";
import { Pool } from "pg";
import type { EventPublisherPort } from "../src/event-publisher";
import { OutboxRelayJob } from "../src/outbox-relay.job";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";

class RecordingPublisher implements EventPublisherPort {
  readonly events: EventEnvelope[] = [];
  fail = true;

  async publish(event: EventEnvelope): Promise<void> {
    if (this.fail) throw new Error("synthetic publisher outage");
    this.events.push(event);
  }
}

describe("T07 outbox relay", () => {
  let pool: Pool;
  const eventId = randomUUID();
  const aggregateId = randomUUID();

  beforeAll(async () => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query(
      `INSERT INTO platform.outbox
         (event_id,aggregate_id,aggregate_type,event_type,payload,
          occurred_at,event_version,trace_id)
       VALUES ($1,$2,'incident','incident.received.v1',$3::jsonb,'2000-01-01T00:00:00Z',1,$4)`,
      [
        eventId,
        aggregateId,
        JSON.stringify({
          incident_id: aggregateId,
          incident_type: "TRAFFIC_ACCIDENT",
          priority: "CRITICAL",
          area_id: "test-t07-relay",
          state: "RECEIVED",
        }),
        randomUUID().replaceAll("-", ""),
      ],
    );
  });

  afterAll(async () => {
    if (SKIP) return;
    await pool.query("DELETE FROM platform.outbox WHERE event_id=$1", [
      eventId,
    ]);
    await pool.end();
  });

  it("keeps a failed publish pending and succeeds on a later retry", async () => {
    if (SKIP) return;
    const publisher = new RecordingPublisher();
    const relay = new OutboxRelayJob(pool, publisher, 1);
    await expect(relay.runOnce()).resolves.toMatchObject({ failed: 1 });
    const pending = await pool.query<{
      published_at: Date | null;
      publish_attempts: number;
      last_error: string | null;
    }>(
      "SELECT published_at,publish_attempts,last_error FROM platform.outbox WHERE event_id=$1",
      [eventId],
    );
    expect(pending.rows[0]).toEqual({
      published_at: null,
      publish_attempts: 1,
      last_error: "PUBLISH_FAILED",
    });

    publisher.fail = false;
    await expect(relay.runOnce()).resolves.toMatchObject({ published: 1 });
    expect(publisher.events).toHaveLength(1);
    const completed = await pool.query<{
      published: boolean;
      publish_attempts: number;
      last_error: string | null;
    }>(
      "SELECT published_at IS NOT NULL AS published,publish_attempts,last_error FROM platform.outbox WHERE event_id=$1",
      [eventId],
    );
    expect(completed.rows[0]).toEqual({
      published: true,
      publish_attempts: 2,
      last_error: null,
    });
  });
});
