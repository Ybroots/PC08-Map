import type { AccessScope } from "@atgt/authorization";
import { EvidenceAccessGrantSchema } from "@atgt/contracts";
import { EvidenceFailure, type EvidenceRuntimePolicy } from "./evidence.types";
import type {
  EvidenceAccessKind,
  EvidenceAccessRepositoryPort,
  EvidenceAccessResult,
  EvidenceReadStoragePort,
} from "./evidence-access.types";
import { EvidenceAccessMetrics } from "./evidence-access.metrics";

export class EvidenceAccessService {
  constructor(
    private readonly repository: EvidenceAccessRepositoryPort,
    private readonly storage: EvidenceReadStoragePort,
    private readonly policy: EvidenceRuntimePolicy,
    private readonly metrics: EvidenceAccessMetrics = new EvidenceAccessMetrics(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issue(
    scope: AccessScope,
    areaId: string,
    caseId: string,
    evidenceId: string,
    kind: EvidenceAccessKind,
    traceId: string,
  ): Promise<EvidenceAccessResult> {
    const expiresInSeconds = this.requireConfigured();
    const record = await this.repository.findScoped(
      scope,
      areaId,
      caseId,
      evidenceId,
    );
    if (!record) {
      this.metrics.recordDenied();
      await this.repository.recordAccess({
        scope,
        evidenceId,
        areaId,
        kind,
        outcome: "DENIED",
        reason: "NOT_FOUND_OR_SCOPE_MISMATCH",
        traceId,
      });
      throw new EvidenceFailure("NOT_FOUND");
    }

    const mediaType = kind === "PREVIEW" ? "image/png" : record.originalMime;
    const objectKey =
      kind === "PREVIEW"
        ? record.derivativeObjectKey
        : record.originalObjectKey;
    let accessUrl: string;
    try {
      accessUrl = await this.storage.createReadUrl({
        objectKey,
        mime: mediaType,
        kind,
        evidenceId,
        expiresInSeconds,
      });
    } catch (error) {
      this.metrics.recordFailure();
      await this.repository.recordAccess({
        scope,
        evidenceId,
        areaId,
        kind,
        outcome: "ERROR",
        reason: "STORAGE_UNAVAILABLE",
        traceId,
      });
      if (error instanceof EvidenceFailure) throw error;
      throw new EvidenceFailure("STORAGE_UNAVAILABLE");
    }

    await this.repository.recordAccess({
      scope,
      evidenceId,
      areaId,
      kind,
      outcome: "SUCCESS",
      traceId,
    });
    this.metrics.recordIssued(kind);
    return EvidenceAccessGrantSchema.parse({
      evidence_id: evidenceId,
      access_kind: kind,
      media_type: mediaType,
      access_url: accessUrl,
      expires_at: new Date(
        this.now().getTime() + expiresInSeconds * 1000,
      ).toISOString(),
    });
  }

  private requireConfigured(): number {
    const ttl = this.policy.readUrlTtlSeconds;
    if (
      !this.policy.enabled ||
      ttl === undefined ||
      !Number.isInteger(ttl) ||
      ttl < 1 ||
      ttl > 3_600
    ) {
      throw new EvidenceFailure("CONFIGURATION_BLOCKED");
    }
    return ttl;
  }
}
