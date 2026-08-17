export const EVIDENCE_STATES = [
  "INITIATED",
  "SCAN_PENDING",
  "READY",
  "REJECTED",
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export type EvidenceRuleViolationCode =
  | "INVALID_STATE"
  | "HASH_MISMATCH"
  | "MIME_MISMATCH"
  | "SIZE_MISMATCH"
  | "SCAN_NOT_CLEAN"
  | "DERIVATIVE_REQUIRED";

export class EvidenceRuleViolation extends Error {
  constructor(readonly code: EvidenceRuleViolationCode) {
    super(code);
    this.name = "EvidenceRuleViolation";
  }
}

export interface EvidenceSnapshot {
  readonly state: EvidenceState;
  readonly declaredSha256: string;
  readonly declaredMime: string;
  readonly declaredSizeBytes: number;
  readonly observedSha256?: string;
  readonly rejectionCode?: string;
}

export interface EvidenceScanFacts {
  readonly sha256: string;
  readonly mime: string;
  readonly sizeBytes: number;
  readonly malwareClean: boolean;
  readonly originalStored: boolean;
  readonly derivativeStored: boolean;
}

export function queueEvidenceScan(
  evidence: EvidenceSnapshot,
  observedSha256: string,
): EvidenceSnapshot {
  if (evidence.state !== "INITIATED") {
    throw new EvidenceRuleViolation("INVALID_STATE");
  }
  if (observedSha256 !== evidence.declaredSha256) {
    throw new EvidenceRuleViolation("HASH_MISMATCH");
  }
  return {
    ...evidence,
    state: "SCAN_PENDING",
    observedSha256,
  };
}

export function markEvidenceReady(
  evidence: EvidenceSnapshot,
  facts: EvidenceScanFacts,
): EvidenceSnapshot {
  if (evidence.state !== "SCAN_PENDING") {
    throw new EvidenceRuleViolation("INVALID_STATE");
  }
  if (
    facts.sha256 !== evidence.declaredSha256 ||
    facts.sha256 !== evidence.observedSha256
  ) {
    throw new EvidenceRuleViolation("HASH_MISMATCH");
  }
  if (facts.mime !== evidence.declaredMime) {
    throw new EvidenceRuleViolation("MIME_MISMATCH");
  }
  if (facts.sizeBytes !== evidence.declaredSizeBytes) {
    throw new EvidenceRuleViolation("SIZE_MISMATCH");
  }
  if (!facts.malwareClean) {
    throw new EvidenceRuleViolation("SCAN_NOT_CLEAN");
  }
  if (!facts.originalStored || !facts.derivativeStored) {
    throw new EvidenceRuleViolation("DERIVATIVE_REQUIRED");
  }
  return { ...evidence, state: "READY", rejectionCode: undefined };
}

export function rejectEvidence(
  evidence: EvidenceSnapshot,
  rejectionCode: string,
): EvidenceSnapshot {
  if (evidence.state !== "SCAN_PENDING") {
    throw new EvidenceRuleViolation("INVALID_STATE");
  }
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(rejectionCode)) {
    throw new Error("INVALID_REJECTION_CODE");
  }
  return { ...evidence, state: "REJECTED", rejectionCode };
}
