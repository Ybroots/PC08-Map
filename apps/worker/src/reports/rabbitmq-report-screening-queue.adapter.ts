import { connect } from "amqplib";
import type {
  ReportQueueDisposition,
  ReportQueuePollResult,
  ReportScreeningQueuePort,
} from "./report-screening.types";

export class RabbitMqReportScreeningQueueAdapter implements ReportScreeningQueuePort {
  constructor(
    private readonly endpoints: readonly string[],
    private readonly vhost: string,
  ) {}

  async poll(
    batchSize: number,
    handler: (payload: unknown) => Promise<ReportQueueDisposition>,
  ): Promise<ReportQueuePollResult> {
    let lastError: unknown;
    for (const endpoint of this.endpoints) {
      let connection: Awaited<ReturnType<typeof connect>> | undefined;
      try {
        const uri = new URL(endpoint);
        uri.pathname = `/${encodeURIComponent(this.vhost)}`;
        connection = await connect(uri.toString());
        const channel = await connection.createChannel();
        const result: ReportQueuePollResult = {
          acknowledged: 0,
          rejected: 0,
          requeued: 0,
        };
        for (let index = 0; index < batchSize; index += 1) {
          const message = await channel.get("reports.screening", {
            noAck: false,
          });
          if (!message) break;
          let disposition: ReportQueueDisposition = "REJECT";
          try {
            const payload: unknown = JSON.parse(message.content.toString());
            disposition = await handler(payload);
          } catch {
            disposition = "REJECT";
          }
          if (disposition === "ACK") {
            channel.ack(message);
            result.acknowledged += 1;
          } else if (disposition === "REQUEUE") {
            channel.nack(message, false, true);
            result.requeued += 1;
            break;
          } else {
            channel.nack(message, false, false);
            result.rejected += 1;
          }
        }
        await channel.close();
        await connection.close();
        return result;
      } catch (error) {
        lastError = error;
        if (connection) await connection.close().catch(() => undefined);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("REPORT_SCREENING_QUEUE_UNAVAILABLE");
  }
}
