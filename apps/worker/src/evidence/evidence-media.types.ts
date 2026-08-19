import type { EvidenceScanRequestedEvent } from "@atgt/contracts";

export type SupportedEvidenceMime = "image/jpeg" | "image/png";

export interface EvidenceUploadWorkItem {
  evidenceId: string;
  state: "SCAN_PENDING" | "READY" | "REJECTED";
  quarantineObjectKey: string;
  declaredSha256: string;
  declaredMime: string;
  declaredSizeBytes: number;
}

export interface EvidenceReadyOutcome {
  kind: "READY";
  sha256: string;
  mime: SupportedEvidenceMime;
  sizeBytes: number;
  scanEngine: string;
  scanEngineVersion: string;
  originalObjectKey: string;
  derivativeObjectKey: string;
}

export interface EvidenceRejectedOutcome {
  kind: "REJECTED";
  rejectionCode:
    | "HASH_MISMATCH"
    | "IMMUTABLE_OBJECT_CONFLICT"
    | "MALWARE_DETECTED"
    | "MIME_MISMATCH"
    | "QUARANTINE_OBJECT_MISSING"
    | "SIZE_MISMATCH"
    | "UNSUPPORTED_MEDIA";
  scanEngine: string;
  scanEngineVersion: string;
}

export type EvidenceProcessingOutcome =
  EvidenceReadyOutcome | EvidenceRejectedOutcome;

export interface EvidenceWorkLease {
  load(): Promise<EvidenceUploadWorkItem | null>;
  complete(
    event: EvidenceScanRequestedEvent,
    outcome?: EvidenceProcessingOutcome,
  ): Promise<"PROCESSED" | "DUPLICATE">;
  release(): Promise<void>;
}

export interface EvidenceWorkCoordinatorPort {
  tryAcquire(evidenceId: string): Promise<EvidenceWorkLease | null>;
}

export interface EvidenceMediaStoragePort {
  readQuarantine(objectKey: string, maxBytes: number): Promise<Buffer>;
  storeOriginalImmutable(
    objectKey: string,
    bytes: Buffer,
    mime: SupportedEvidenceMime,
  ): Promise<void>;
  storeDerivativeImmutable(
    objectKey: string,
    bytes: Buffer,
    mime: "image/png",
  ): Promise<void>;
}

export interface AntivirusVerdict {
  clean: boolean;
  engine: string;
  engineVersion: string;
}

export interface AntivirusPort {
  scan(bytes: Buffer): Promise<AntivirusVerdict>;
}

export interface EvidenceDerivativePort {
  create(input: {
    evidenceId: string;
    bytes: Buffer;
    mime: SupportedEvidenceMime;
  }): Promise<Buffer>;
}

export type EvidenceQueueDisposition = "ACK" | "REJECT" | "REQUEUE";

export interface EvidenceQueuePollResult {
  acknowledged: number;
  rejected: number;
  requeued: number;
}

export interface EvidenceQueuePort {
  poll(
    batchSize: number,
    handler: (payload: unknown) => Promise<EvidenceQueueDisposition>,
  ): Promise<EvidenceQueuePollResult>;
}

export type EvidenceMediaFailureCode =
  | "IMMUTABLE_OBJECT_CONFLICT"
  | "PROVIDER_UNAVAILABLE"
  | "QUARANTINE_OBJECT_MISSING"
  | "SIZE_LIMIT_EXCEEDED"
  | "UNSUPPORTED_MEDIA";

export class EvidenceMediaFailure extends Error {
  constructor(
    readonly code: EvidenceMediaFailureCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "EvidenceMediaFailure";
  }
}
