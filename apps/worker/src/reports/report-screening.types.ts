import type {
  ReportEvidenceLinkedEvent,
  ReportReceivedEvent,
} from "@atgt/contracts";

export type ReportScreeningEvent =
  ReportReceivedEvent | ReportEvidenceLinkedEvent;

export type ReportQueueDisposition = "ACK" | "REJECT" | "REQUEUE";

export interface ReportQueuePollResult {
  acknowledged: number;
  rejected: number;
  requeued: number;
}

export interface ReportScreeningQueuePort {
  poll(
    batchSize: number,
    handler: (payload: unknown) => Promise<ReportQueueDisposition>,
  ): Promise<ReportQueuePollResult>;
}

export interface ReportScreeningCoordinatorPort {
  process(
    event: ReportScreeningEvent,
    maxCandidatesPerReport: number,
  ): Promise<"PROCESSED" | "DUPLICATE">;
}

export type ReportScreeningFailureCode =
  | "CANDIDATE_LIMIT_EXCEEDED"
  | "EVENT_REPORT_MISMATCH"
  | "REPORT_EVIDENCE_NOT_FOUND"
  | "REPORT_NOT_FOUND"
  | "REPORT_STATE_CONFLICT";

export class ReportScreeningFailure extends Error {
  constructor(
    readonly code: ReportScreeningFailureCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "ReportScreeningFailure";
  }
}
