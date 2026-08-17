import type {
  EvidenceScanPending,
  EvidenceUploadInitiated,
  FinalizeEvidenceUpload,
  InitiateEvidenceUpload,
} from "@atgt/contracts";

export type EvidenceFailureCode =
  | "CONFIGURATION_BLOCKED"
  | "MIME_NOT_ALLOWED"
  | "SIZE_EXCEEDED"
  | "HASH_MISMATCH"
  | "NOT_FOUND"
  | "EXPIRED"
  | "STATE_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "UPLOAD_MISSING"
  | "STORAGE_UNAVAILABLE";

export class EvidenceFailure extends Error {
  constructor(readonly code: EvidenceFailureCode) {
    super(code);
    this.name = "EvidenceFailure";
  }
}

export interface EvidenceRuntimePolicy {
  readonly enabled: boolean;
  readonly allowedMimeTypes: readonly string[];
  readonly maxBytes?: number;
  readonly uploadUrlTtlSeconds?: number;
  readonly capabilitySecret?: string;
}

export interface EvidenceUploadRecord {
  readonly uploadId: string;
  readonly quarantineObjectKey: string;
  readonly declaredSha256: string;
  readonly declaredMime: string;
  readonly declaredSizeBytes: number;
  readonly state: "INITIATED" | "SCAN_PENDING" | "READY" | "REJECTED";
  readonly expiresAt: Date;
  readonly finalizedAt?: Date;
}

export interface CreateEvidenceUploadProposal {
  readonly uploadId: string;
  readonly quarantineObjectKey: string;
  readonly capabilityHash: string;
  readonly expiresAt: Date;
}

export interface EvidenceRepositoryPort {
  createOrReplay(
    input: InitiateEvidenceUpload,
    proposal: CreateEvidenceUploadProposal,
    idempotencyKey: string,
    traceId: string,
    now: Date,
  ): Promise<EvidenceUploadRecord>;
  getForFinalize(
    uploadId: string,
    capabilityHash: string,
  ): Promise<EvidenceUploadRecord | null>;
  finalize(
    uploadId: string,
    capabilityHash: string,
    input: FinalizeEvidenceUpload,
    traceId: string,
    now: Date,
  ): Promise<Date>;
}

export interface QuarantineObjectFacts {
  readonly mime: string;
  readonly sizeBytes: number;
}

export interface EvidenceStoragePort {
  createUploadUrl(input: {
    objectKey: string;
    mime: string;
    expiresInSeconds: number;
  }): Promise<string>;
  inspectQuarantineObject(objectKey: string): Promise<QuarantineObjectFacts>;
}

export type EvidenceInitiateResult = EvidenceUploadInitiated;
export type EvidenceFinalizeResult = EvidenceScanPending;
