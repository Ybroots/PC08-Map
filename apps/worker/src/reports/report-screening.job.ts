import {
  EVENT_ROUTING_KEYS,
  ReportEvidenceLinkedEventSchema,
  ReportReceivedEventSchema,
} from "@atgt/contracts";
import {
  ReportScreeningFailure,
  type ReportScreeningCoordinatorPort,
  type ReportScreeningQueuePort,
} from "./report-screening.types";

export class ReportScreeningJob {
  constructor(
    private readonly queue: ReportScreeningQueuePort,
    private readonly coordinator: ReportScreeningCoordinatorPort,
    private readonly batchSize: number,
    private readonly maxCandidatesPerReport: number,
  ) {}

  runOnce() {
    return this.queue.poll(this.batchSize, async (payload) => {
      const parsed =
        typeof payload === "object" &&
        payload !== null &&
        "type" in payload &&
        payload.type === EVENT_ROUTING_KEYS.REPORT_EVIDENCE_LINKED
          ? ReportEvidenceLinkedEventSchema.safeParse(payload)
          : ReportReceivedEventSchema.safeParse(payload);
      if (!parsed.success) return "REJECT";
      if (parsed.data.aggregate_id !== parsed.data.data.report_id) {
        return "REJECT";
      }
      try {
        await this.coordinator.process(
          parsed.data,
          this.maxCandidatesPerReport,
        );
        return "ACK";
      } catch (error) {
        if (error instanceof ReportScreeningFailure && !error.retryable) {
          return "REJECT";
        }
        return "REQUEUE";
      }
    });
  }
}
