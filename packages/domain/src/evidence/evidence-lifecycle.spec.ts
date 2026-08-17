import {
  EvidenceRuleViolation,
  markEvidenceReady,
  queueEvidenceScan,
  rejectEvidence,
  type EvidenceRuleViolationCode,
  type EvidenceScanFacts,
  type EvidenceSnapshot,
} from "./evidence-lifecycle";

const sha256 = "a".repeat(64);
const initiated = (): EvidenceSnapshot => ({
  state: "INITIATED",
  declaredSha256: sha256,
  declaredMime: "image/jpeg",
  declaredSizeBytes: 4096,
});
const cleanFacts = (): EvidenceScanFacts => ({
  sha256,
  mime: "image/jpeg",
  sizeBytes: 4096,
  malwareClean: true,
  originalStored: true,
  derivativeStored: true,
});

describe("evidence lifecycle", () => {
  it("moves an exact finalized upload into scan pending", () => {
    expect(queueEvidenceScan(initiated(), sha256)).toEqual({
      ...initiated(),
      state: "SCAN_PENDING",
      observedSha256: sha256,
    });
    expect(() => queueEvidenceScan(initiated(), "b".repeat(64))).toThrow(
      new EvidenceRuleViolation("HASH_MISMATCH"),
    );
  });

  it.each([
    ["hash", { sha256: "b".repeat(64) }, "HASH_MISMATCH"],
    ["mime", { mime: "image/png" }, "MIME_MISMATCH"],
    ["size", { sizeBytes: 4095 }, "SIZE_MISMATCH"],
    ["malware", { malwareClean: false }, "SCAN_NOT_CLEAN"],
    ["original", { originalStored: false }, "DERIVATIVE_REQUIRED"],
    ["derivative", { derivativeStored: false }, "DERIVATIVE_REQUIRED"],
  ])("does not mark READY with invalid %s facts", (_name, override, code) => {
    const pending = queueEvidenceScan(initiated(), sha256);
    expect(() =>
      markEvidenceReady(pending, { ...cleanFacts(), ...override }),
    ).toThrow(new EvidenceRuleViolation(code as EvidenceRuleViolationCode));
  });

  it("marks READY only after every scan/storage fact passes", () => {
    const pending = queueEvidenceScan(initiated(), sha256);
    expect(markEvidenceReady(pending, cleanFacts()).state).toBe("READY");
  });

  it("keeps rejection terminal and requires a stable code", () => {
    const pending = queueEvidenceScan(initiated(), sha256);
    const rejected = rejectEvidence(pending, "MALWARE_DETECTED");
    expect(rejected).toMatchObject({
      state: "REJECTED",
      rejectionCode: "MALWARE_DETECTED",
    });
    expect(() => rejectEvidence(rejected, "MALWARE_DETECTED")).toThrow(
      new EvidenceRuleViolation("INVALID_STATE"),
    );
    expect(() => rejectEvidence(pending, "bad detail")).toThrow(
      "INVALID_REJECTION_CODE",
    );
  });
});
