import type { AccessScope, DataClass } from "@atgt/authorization";
import type { EvidenceAccessGrant } from "@atgt/contracts";

export type EvidenceAccessKind = "PREVIEW" | "DOWNLOAD";

export interface EvidenceAccessRecord {
  readonly evidenceId: string;
  readonly originalObjectKey: string;
  readonly derivativeObjectKey: string;
  readonly originalMime: string;
  readonly dataClass: DataClass;
}

export interface EvidenceAccessRepositoryPort {
  findScoped(
    scope: AccessScope,
    areaId: string,
    caseId: string,
    evidenceId: string,
  ): Promise<EvidenceAccessRecord | null>;
  recordAccess(input: {
    scope: AccessScope;
    evidenceId: string;
    areaId: string;
    kind: EvidenceAccessKind;
    outcome: "SUCCESS" | "DENIED" | "ERROR";
    reason?: "NOT_FOUND_OR_SCOPE_MISMATCH" | "STORAGE_UNAVAILABLE";
    traceId: string;
  }): Promise<void>;
}

export interface EvidenceReadStoragePort {
  createReadUrl(input: {
    objectKey: string;
    mime: string;
    kind: EvidenceAccessKind;
    evidenceId: string;
    expiresInSeconds: number;
  }): Promise<string>;
}

export type EvidenceAccessResult = EvidenceAccessGrant;
