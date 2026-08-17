import { randomUUID } from "node:crypto";
import {
  EvidenceScanPendingSchema,
  EvidenceUploadInitiatedSchema,
  type FinalizeEvidenceUpload,
  type InitiateEvidenceUpload,
} from "@atgt/contracts";
import {
  deriveUploadCapability,
  hashUploadCapability,
} from "./evidence-capability";
import {
  EvidenceFailure,
  type EvidenceFinalizeResult,
  type EvidenceInitiateResult,
  type EvidenceRepositoryPort,
  type EvidenceRuntimePolicy,
  type EvidenceStoragePort,
} from "./evidence.types";

export class EvidenceService {
  constructor(
    private readonly repository: EvidenceRepositoryPort,
    private readonly storage: EvidenceStoragePort,
    private readonly policy: EvidenceRuntimePolicy,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = randomUUID,
  ) {}

  async initiate(
    input: InitiateEvidenceUpload,
    idempotencyKey: string,
    traceId: string,
  ): Promise<EvidenceInitiateResult> {
    const { maxBytes, uploadUrlTtlSeconds, capabilitySecret } =
      this.requireConfigured();
    if (!this.policy.allowedMimeTypes.includes(input.declared_mime)) {
      throw new EvidenceFailure("MIME_NOT_ALLOWED");
    }
    if (input.declared_size_bytes > maxBytes) {
      throw new EvidenceFailure("SIZE_EXCEEDED");
    }

    const now = this.now();
    const uploadId = this.newId();
    const capability = deriveUploadCapability(capabilitySecret, uploadId);
    const record = await this.repository.createOrReplay(
      input,
      {
        uploadId,
        quarantineObjectKey: `quarantine/${this.newId()}/${this.newId()}`,
        capabilityHash: hashUploadCapability(capability),
        expiresAt: new Date(now.getTime() + uploadUrlTtlSeconds * 1000),
      },
      idempotencyKey,
      traceId,
      now,
    );
    const replayCapability = deriveUploadCapability(
      capabilitySecret,
      record.uploadId,
    );
    const uploadUrl = await this.storage.createUploadUrl({
      objectKey: record.quarantineObjectKey,
      mime: record.declaredMime,
      expiresInSeconds: Math.max(
        1,
        Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000),
      ),
    });
    return EvidenceUploadInitiatedSchema.parse({
      upload_id: record.uploadId,
      upload_url: uploadUrl,
      upload_method: "PUT",
      upload_capability: replayCapability,
      expires_at: record.expiresAt.toISOString(),
    });
  }

  async finalize(
    uploadId: string,
    capability: string,
    input: FinalizeEvidenceUpload,
    traceId: string,
  ): Promise<EvidenceFinalizeResult> {
    this.requireConfigured();
    const capabilityHash = hashUploadCapability(capability);
    const record = await this.repository.getForFinalize(
      uploadId,
      capabilityHash,
    );
    if (!record) throw new EvidenceFailure("NOT_FOUND");
    if (input.observed_sha256 !== record.declaredSha256) {
      throw new EvidenceFailure("HASH_MISMATCH");
    }
    const now = this.now();
    if (record.state === "INITIATED") {
      if (record.expiresAt <= now) throw new EvidenceFailure("EXPIRED");
      const facts = await this.storage.inspectQuarantineObject(
        record.quarantineObjectKey,
      );
      if (facts.mime !== record.declaredMime) {
        throw new EvidenceFailure("MIME_NOT_ALLOWED");
      }
      if (facts.sizeBytes !== record.declaredSizeBytes) {
        throw new EvidenceFailure("SIZE_EXCEEDED");
      }
    }
    const finalizedAt = await this.repository.finalize(
      uploadId,
      capabilityHash,
      input,
      traceId,
      now,
    );
    return EvidenceScanPendingSchema.parse({
      evidence_id: uploadId,
      state: "SCAN_PENDING",
      accepted_at: finalizedAt.toISOString(),
    });
  }

  private requireConfigured(): {
    maxBytes: number;
    uploadUrlTtlSeconds: number;
    capabilitySecret: string;
  } {
    const { enabled, maxBytes, uploadUrlTtlSeconds, capabilitySecret } =
      this.policy;
    if (
      !enabled ||
      maxBytes === undefined ||
      uploadUrlTtlSeconds === undefined ||
      capabilitySecret === undefined
    ) {
      throw new EvidenceFailure("CONFIGURATION_BLOCKED");
    }
    return { maxBytes, uploadUrlTtlSeconds, capabilitySecret };
  }
}
