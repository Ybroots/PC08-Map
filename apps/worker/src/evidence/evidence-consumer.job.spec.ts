import { randomUUID } from "node:crypto";
import { EVENT_ROUTING_KEYS } from "@atgt/contracts";
import { EvidenceConsumerJob } from "./evidence-consumer.job";
import type { EvidenceMediaProcessor } from "./evidence-media.processor";
import {
  EvidenceMediaFailure,
  type EvidenceQueueDisposition,
  type EvidenceQueuePort,
} from "./evidence-media.types";

class FakeQueue implements EvidenceQueuePort {
  dispositions: EvidenceQueueDisposition[] = [];
  constructor(private readonly payloads: unknown[]) {}

  async poll(
    batchSize: number,
    handler: (payload: unknown) => Promise<EvidenceQueueDisposition>,
  ) {
    for (const payload of this.payloads.slice(0, batchSize)) {
      this.dispositions.push(await handler(payload));
    }
    return { acknowledged: 0, rejected: 0, requeued: 0 };
  }
}

function validEvent() {
  const evidenceId = randomUUID();
  return {
    event_id: randomUUID(),
    type: EVENT_ROUTING_KEYS.EVIDENCE_SCAN_REQUESTED,
    version: 1,
    occurred_at: "2026-08-19T00:00:00.000Z",
    trace_id: "b".repeat(32),
    aggregate_id: evidenceId,
    aggregate_type: "evidence",
    data: { evidence_id: evidenceId, state: "SCAN_PENDING" },
  };
}

describe("EvidenceConsumerJob", () => {
  it("acks success, requeues retryable work and rejects invalid envelopes", async () => {
    const events = [
      validEvent(),
      validEvent(),
      { object_key: "must-not-pass" },
    ];
    const queue = new FakeQueue(events);
    const process = jest
      .fn()
      .mockResolvedValueOnce("PROCESSED")
      .mockRejectedValueOnce(
        new EvidenceMediaFailure("PROVIDER_UNAVAILABLE", true),
      );
    const job = new EvidenceConsumerJob(
      queue,
      { process } as unknown as EvidenceMediaProcessor,
      3,
    );
    await job.runOnce();
    expect(queue.dispositions).toEqual(["ACK", "REQUEUE", "REJECT"]);
  });

  it("rejects a non-retryable immutable object conflict", async () => {
    const queue = new FakeQueue([validEvent()]);
    const process = jest
      .fn()
      .mockRejectedValue(
        new EvidenceMediaFailure("IMMUTABLE_OBJECT_CONFLICT", false),
      );
    await new EvidenceConsumerJob(
      queue,
      { process } as unknown as EvidenceMediaProcessor,
      1,
    ).runOnce();
    expect(queue.dispositions).toEqual(["REJECT"]);
  });
});
