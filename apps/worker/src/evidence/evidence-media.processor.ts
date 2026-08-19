import {
  markEvidenceReady,
  type EvidenceScanFacts,
  type EvidenceSnapshot,
} from "@atgt/domain";
import type { EvidenceScanRequestedEvent } from "@atgt/contracts";
import {
  EvidenceMediaFailure,
  type AntivirusPort,
  type EvidenceDerivativePort,
  type EvidenceMediaStoragePort,
  type EvidenceProcessingOutcome,
  type EvidenceRejectedOutcome,
  type EvidenceWorkCoordinatorPort,
  type SupportedEvidenceMime,
} from "./evidence-media.types";
import { detectEvidenceMime, sha256 } from "./media-validation";

const VALIDATOR_ENGINE = "atgt-media-validator";
const VALIDATOR_VERSION = "1";

export type EvidenceMediaProcessResult =
  "DUPLICATE" | "PROCESSED" | "SKIPPED_LOCKED";

function rejected(
  rejectionCode: EvidenceRejectedOutcome["rejectionCode"],
  scanEngine = VALIDATOR_ENGINE,
  scanEngineVersion = VALIDATOR_VERSION,
): EvidenceRejectedOutcome {
  return {
    kind: "REJECTED",
    rejectionCode,
    scanEngine,
    scanEngineVersion,
  };
}

function supportedMime(value: string): value is SupportedEvidenceMime {
  return value === "image/jpeg" || value === "image/png";
}

export class EvidenceMediaProcessor {
  constructor(
    private readonly coordinator: EvidenceWorkCoordinatorPort,
    private readonly storage: EvidenceMediaStoragePort,
    private readonly antivirus: AntivirusPort,
    private readonly derivative: EvidenceDerivativePort,
    private readonly maxBytes: number,
  ) {}

  async process(
    event: EvidenceScanRequestedEvent,
  ): Promise<EvidenceMediaProcessResult> {
    const lease = await this.coordinator.tryAcquire(event.data.evidence_id);
    if (!lease) return "SKIPPED_LOCKED";
    try {
      const upload = await lease.load();
      if (!upload) throw new Error("EVIDENCE_UPLOAD_NOT_FOUND");
      if (upload.state !== "SCAN_PENDING") {
        return await lease.complete(event);
      }

      let bytes: Buffer;
      try {
        bytes = await this.storage.readQuarantine(
          upload.quarantineObjectKey,
          this.maxBytes,
        );
      } catch (error) {
        if (
          error instanceof EvidenceMediaFailure &&
          !error.retryable &&
          (error.code === "QUARANTINE_OBJECT_MISSING" ||
            error.code === "SIZE_LIMIT_EXCEEDED")
        ) {
          const outcome =
            error.code === "QUARANTINE_OBJECT_MISSING"
              ? rejected("QUARANTINE_OBJECT_MISSING")
              : rejected("SIZE_MISMATCH");
          return await lease.complete(event, outcome);
        }
        throw error;
      }

      const outcome = await this.evaluate(upload, bytes);
      return await lease.complete(event, outcome);
    } finally {
      await lease.release();
    }
  }

  private async evaluate(
    upload: {
      evidenceId: string;
      declaredSha256: string;
      declaredMime: string;
      declaredSizeBytes: number;
    },
    bytes: Buffer,
  ): Promise<EvidenceProcessingOutcome> {
    if (bytes.length !== upload.declaredSizeBytes) {
      return rejected("SIZE_MISMATCH");
    }
    const observedSha256 = sha256(bytes);
    if (observedSha256 !== upload.declaredSha256) {
      return rejected("HASH_MISMATCH");
    }
    if (!supportedMime(upload.declaredMime)) {
      return rejected("UNSUPPORTED_MEDIA");
    }
    const detectedMime = detectEvidenceMime(bytes);
    if (!detectedMime) return rejected("UNSUPPORTED_MEDIA");
    if (detectedMime !== upload.declaredMime) {
      return rejected("MIME_MISMATCH");
    }

    const verdict = await this.antivirus.scan(bytes);
    if (!verdict.clean) {
      return rejected(
        "MALWARE_DETECTED",
        verdict.engine,
        verdict.engineVersion,
      );
    }
    let derivative: Buffer;
    try {
      derivative = await this.derivative.create({
        evidenceId: upload.evidenceId,
        bytes,
        mime: detectedMime,
      });
    } catch (error) {
      if (error instanceof EvidenceMediaFailure && !error.retryable) {
        return rejected("UNSUPPORTED_MEDIA");
      }
      throw error;
    }
    const originalObjectKey = `original/${upload.evidenceId}`;
    const derivativeObjectKey = `derivative/${upload.evidenceId}.png`;
    try {
      await this.storage.storeDerivativeImmutable(
        derivativeObjectKey,
        derivative,
        "image/png",
      );
      await this.storage.storeOriginalImmutable(
        originalObjectKey,
        bytes,
        detectedMime,
      );
    } catch (error) {
      if (
        error instanceof EvidenceMediaFailure &&
        error.code === "IMMUTABLE_OBJECT_CONFLICT"
      ) {
        return rejected("IMMUTABLE_OBJECT_CONFLICT");
      }
      throw error;
    }

    const snapshot: EvidenceSnapshot = {
      state: "SCAN_PENDING",
      declaredSha256: upload.declaredSha256,
      declaredMime: upload.declaredMime,
      declaredSizeBytes: upload.declaredSizeBytes,
      observedSha256,
    };
    const facts: EvidenceScanFacts = {
      sha256: observedSha256,
      mime: detectedMime,
      sizeBytes: bytes.length,
      malwareClean: verdict.clean,
      originalStored: true,
      derivativeStored: true,
    };
    markEvidenceReady(snapshot, facts);
    return {
      kind: "READY",
      sha256: observedSha256,
      mime: detectedMime,
      sizeBytes: bytes.length,
      scanEngine: verdict.engine,
      scanEngineVersion: verdict.engineVersion,
      originalObjectKey,
      derivativeObjectKey,
    };
  }
}
