import { randomUUID } from "node:crypto";
import { EVENT_ROUTING_KEYS } from "@atgt/contracts";
import { ReportScreeningJob } from "./report-screening.job";
import {
  ReportScreeningFailure,
  type ReportQueueDisposition,
  type ReportScreeningCoordinatorPort,
  type ReportScreeningQueuePort,
} from "./report-screening.types";

class FakeQueue implements ReportScreeningQueuePort {
  dispositions: ReportQueueDisposition[] = [];

  constructor(private readonly payloads: unknown[]) {}

  async poll(
    batchSize: number,
    handler: (payload: unknown) => Promise<ReportQueueDisposition>,
  ) {
    for (const payload of this.payloads.slice(0, batchSize)) {
      this.dispositions.push(await handler(payload));
    }
    return { acknowledged: 0, rejected: 0, requeued: 0 };
  }
}

function receivedEvent() {
  const reportId = randomUUID();
  return {
    event_id: randomUUID(),
    type: EVENT_ROUTING_KEYS.REPORT_RECEIVED,
    version: 1,
    occurred_at: "2026-08-19T00:00:00.000Z",
    trace_id: "a".repeat(32),
    aggregate_id: reportId,
    aggregate_type: "report",
    data: {
      report_id: reportId,
      category_code: "ROAD_HAZARD",
      area_id: "area-dalat",
      state: "RECEIVED",
    },
  };
}

function linkedEvent() {
  const reportId = randomUUID();
  return {
    event_id: randomUUID(),
    type: EVENT_ROUTING_KEYS.REPORT_EVIDENCE_LINKED,
    version: 1,
    occurred_at: "2026-08-19T00:00:00.000Z",
    trace_id: "b".repeat(32),
    aggregate_id: reportId,
    aggregate_type: "report",
    data: {
      report_id: reportId,
      evidence_id: randomUUID(),
      area_id: "area-dalat",
    },
  };
}

describe("ReportScreeningJob", () => {
  it("accepts only report screening envelopes and forwards explicit bounds", async () => {
    const events = [receivedEvent(), linkedEvent(), { report_id: "unsafe" }];
    const queue = new FakeQueue(events);
    const process = jest.fn().mockResolvedValue("PROCESSED");
    await new ReportScreeningJob(
      queue,
      { process } as ReportScreeningCoordinatorPort,
      3,
      5,
    ).runOnce();
    expect(queue.dispositions).toEqual(["ACK", "ACK", "REJECT"]);
    expect(process).toHaveBeenCalledTimes(2);
    expect(process.mock.calls[0]?.[1]).toBe(5);
  });

  it("rejects aggregate mismatches and non-retryable candidate overflow", async () => {
    const mismatch = receivedEvent();
    mismatch.aggregate_id = randomUUID();
    const queue = new FakeQueue([mismatch, linkedEvent()]);
    const process = jest
      .fn()
      .mockRejectedValue(
        new ReportScreeningFailure("CANDIDATE_LIMIT_EXCEEDED", false),
      );
    await new ReportScreeningJob(
      queue,
      { process } as ReportScreeningCoordinatorPort,
      2,
      1,
    ).runOnce();
    expect(queue.dispositions).toEqual(["REJECT", "REJECT"]);
  });

  it("requeues transient coordinator failures", async () => {
    const queue = new FakeQueue([receivedEvent()]);
    const process = jest.fn().mockRejectedValue(new Error("database offline"));
    await new ReportScreeningJob(
      queue,
      { process } as ReportScreeningCoordinatorPort,
      1,
      1,
    ).runOnce();
    expect(queue.dispositions).toEqual(["REQUEUE"]);
  });
});
