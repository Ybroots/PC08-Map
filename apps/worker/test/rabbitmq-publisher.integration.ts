import { randomUUID } from "node:crypto";
import { connect } from "amqplib";
import { EVENT_ROUTING_KEYS, type EventEnvelope } from "@atgt/contracts";
import { RabbitMqEventPublisher } from "../src/rabbitmq-event.publisher";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const RABBITMQ_URL =
  process.env["RABBITMQ_TEST_URL"] ??
  "amqp://atgt:devpassword_local@localhost:5672";

describe("T07 RabbitMQ publisher adapter", () => {
  it("publishes a persistent envelope through the topic exchange", async () => {
    if (SKIP) return;
    const observer = await connect(`${RABBITMQ_URL}/%2F`);
    const channel = await observer.createChannel();
    const queue = await channel.assertQueue("", {
      exclusive: true,
      autoDelete: true,
    });
    await channel.bindQueue(
      queue.queue,
      "atgt.events",
      EVENT_ROUTING_KEYS.INCIDENT_RECEIVED,
    );
    const event: EventEnvelope = {
      event_id: randomUUID(),
      type: EVENT_ROUTING_KEYS.INCIDENT_RECEIVED,
      version: 1,
      occurred_at: new Date().toISOString(),
      trace_id: randomUUID().replaceAll("-", ""),
      aggregate_id: randomUUID(),
      aggregate_type: "incident",
      data: { state: "RECEIVED", fixture: true },
    };
    try {
      await new RabbitMqEventPublisher([RABBITMQ_URL], "/").publish(event);
      const message = await channel.get(queue.queue, { noAck: false });
      expect(message).not.toBe(false);
      if (message) {
        expect(message.properties.deliveryMode).toBe(2);
        expect(message.properties.messageId).toBe(event.event_id);
        expect(JSON.parse(message.content.toString())).toEqual(event);
        channel.ack(message);
      }
      const routed = await channel.get("incidents.received", { noAck: false });
      expect(routed).not.toBe(false);
      if (routed) {
        expect(routed.properties.messageId).toBe(event.event_id);
        channel.ack(routed);
      }
    } finally {
      await channel.close();
      await observer.close();
    }
  });
});
