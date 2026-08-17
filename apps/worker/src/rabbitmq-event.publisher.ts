import { connect } from "amqplib";
import type { EventEnvelope } from "@atgt/contracts";
import type { EventPublisherPort } from "./event-publisher";

export class RabbitMqEventPublisher implements EventPublisherPort {
  constructor(
    private readonly endpoints: readonly string[],
    private readonly vhost: string,
  ) {}

  async publish(event: EventEnvelope): Promise<void> {
    let unavailable = true;
    for (const endpoint of this.endpoints) {
      let connection: Awaited<ReturnType<typeof connect>> | undefined;
      try {
        const uri = new URL(endpoint);
        uri.pathname = `/${encodeURIComponent(this.vhost)}`;
        connection = await connect(uri.toString());
        const channel = await connection.createConfirmChannel();
        await channel.assertExchange("atgt.events", "topic", {
          durable: true,
        });
        channel.publish(
          "atgt.events",
          event.type,
          Buffer.from(JSON.stringify(event)),
          {
            persistent: true,
            contentType: "application/json",
            messageId: event.event_id,
            timestamp: Math.floor(Date.parse(event.occurred_at) / 1000),
            type: event.type,
          },
        );
        await channel.waitForConfirms();
        await channel.close();
        await connection.close();
        unavailable = false;
        return;
      } catch {
        if (connection) await connection.close().catch(() => undefined);
      }
    }
    if (unavailable) throw new Error("EVENT_PUBLISHER_UNAVAILABLE");
  }
}
