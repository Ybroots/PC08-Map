import { EvidenceScanRequestedEventSchema } from "@atgt/contracts";
import { EvidenceMediaProcessor } from "./evidence-media.processor";
import {
  EvidenceMediaFailure,
  type EvidenceQueuePollResult,
  type EvidenceQueuePort,
} from "./evidence-media.types";

export class EvidenceConsumerJob {
  constructor(
    private readonly queue: EvidenceQueuePort,
    private readonly processor: EvidenceMediaProcessor,
    private readonly batchSize: number,
  ) {}

  runOnce(): Promise<EvidenceQueuePollResult> {
    return this.queue.poll(this.batchSize, async (payload) => {
      const parsed = EvidenceScanRequestedEventSchema.safeParse(payload);
      if (!parsed.success) return "REJECT";
      if (parsed.data.aggregate_id !== parsed.data.data.evidence_id) {
        return "REJECT";
      }
      try {
        const result = await this.processor.process(parsed.data);
        return result === "SKIPPED_LOCKED" ? "REQUEUE" : "ACK";
      } catch (error) {
        if (error instanceof EvidenceMediaFailure && !error.retryable) {
          return "REJECT";
        }
        return "REQUEUE";
      }
    });
  }
}
