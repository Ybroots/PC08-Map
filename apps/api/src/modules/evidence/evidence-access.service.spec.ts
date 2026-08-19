import { createAccessScope, DataClass, OfficerRole } from "@atgt/authorization";
import { EvidenceAccessMetrics } from "./evidence-access.metrics";
import { EvidenceAccessService } from "./evidence-access.service";
import type {
  EvidenceAccessRepositoryPort,
  EvidenceAccessRecord,
  EvidenceReadStoragePort,
} from "./evidence-access.types";
import { EvidenceFailure } from "./evidence.types";

const areaId = "area-a";
const caseId = "00000000-0000-4000-8000-000000000201";
const evidenceId = "00000000-0000-4000-8000-000000000202";
const traceId = "a".repeat(32);
const now = new Date("2026-08-19T08:00:00.000Z");
const scope = createAccessScope({
  principalId: "dispatcher-ref",
  role: OfficerRole.DISPATCHER,
  areaIds: [areaId],
  assignedCaseIds: [caseId],
  maxDataClass: DataClass.SENSITIVE,
});

class FakeAccessRepository implements EvidenceAccessRepositoryPort {
  record: EvidenceAccessRecord | null = {
    evidenceId,
    originalObjectKey: "original/internal-key",
    derivativeObjectKey: "derivative/internal-key.png",
    originalMime: "image/jpeg",
    dataClass: DataClass.SENSITIVE,
  };
  readonly audits: Array<
    Parameters<EvidenceAccessRepositoryPort["recordAccess"]>[0]
  > = [];

  async findScoped() {
    return this.record;
  }

  async recordAccess(
    input: Parameters<EvidenceAccessRepositoryPort["recordAccess"]>[0],
  ): Promise<void> {
    this.audits.push(input);
  }
}

class FakeReadStorage implements EvidenceReadStoragePort {
  readonly requests: Array<
    Parameters<EvidenceReadStoragePort["createReadUrl"]>[0]
  > = [];
  fail = false;

  async createReadUrl(
    input: Parameters<EvidenceReadStoragePort["createReadUrl"]>[0],
  ): Promise<string> {
    this.requests.push(input);
    if (this.fail) throw new EvidenceFailure("STORAGE_UNAVAILABLE");
    return "https://storage.example.test/signed-read";
  }
}

function service(
  repository = new FakeAccessRepository(),
  storage = new FakeReadStorage(),
): EvidenceAccessService {
  return new EvidenceAccessService(
    repository,
    storage,
    {
      enabled: true,
      allowedMimeTypes: ["image/jpeg", "image/png"],
      readUrlTtlSeconds: 120,
    },
    new EvidenceAccessMetrics(),
    () => new Date(now),
  );
}

describe("EvidenceAccessService", () => {
  it.each([
    ["PREVIEW", "image/png", "derivative/internal-key.png"],
    ["DOWNLOAD", "image/jpeg", "original/internal-key"],
  ] as const)(
    "issues and audits a short-lived %s grant",
    async (kind, mediaType, objectKey) => {
      const repository = new FakeAccessRepository();
      const storage = new FakeReadStorage();
      const result = await service(repository, storage).issue(
        scope,
        areaId,
        caseId,
        evidenceId,
        kind,
        traceId,
      );
      expect(result).toEqual({
        evidence_id: evidenceId,
        access_kind: kind,
        media_type: mediaType,
        access_url: "https://storage.example.test/signed-read",
        expires_at: "2026-08-19T08:02:00.000Z",
      });
      expect(storage.requests[0]).toMatchObject({
        objectKey,
        kind,
        expiresInSeconds: 120,
      });
      expect(repository.audits[0]).toMatchObject({
        evidenceId,
        kind,
        outcome: "SUCCESS",
      });
      expect(JSON.stringify(result)).not.toMatch(/objectKey|object_key|sha256/);
    },
  );

  it("does not call storage and audits a uniform scope miss", async () => {
    const repository = new FakeAccessRepository();
    repository.record = null;
    const storage = new FakeReadStorage();
    await expect(
      service(repository, storage).issue(
        scope,
        areaId,
        caseId,
        evidenceId,
        "PREVIEW",
        traceId,
      ),
    ).rejects.toEqual(new EvidenceFailure("NOT_FOUND"));
    expect(storage.requests).toHaveLength(0);
    expect(repository.audits[0]).toMatchObject({
      outcome: "DENIED",
      reason: "NOT_FOUND_OR_SCOPE_MISMATCH",
    });
  });

  it("audits provider failure without persisting a URL or object key", async () => {
    const repository = new FakeAccessRepository();
    const storage = new FakeReadStorage();
    storage.fail = true;
    await expect(
      service(repository, storage).issue(
        scope,
        areaId,
        caseId,
        evidenceId,
        "DOWNLOAD",
        traceId,
      ),
    ).rejects.toEqual(new EvidenceFailure("STORAGE_UNAVAILABLE"));
    expect(repository.audits[0]).toMatchObject({
      outcome: "ERROR",
      reason: "STORAGE_UNAVAILABLE",
    });
    expect(JSON.stringify(repository.audits)).not.toMatch(
      /signed-read|original\/internal-key/,
    );
  });

  it("fails closed when the read TTL is absent", async () => {
    const repository = new FakeAccessRepository();
    const storage = new FakeReadStorage();
    const blocked = new EvidenceAccessService(repository, storage, {
      enabled: true,
      allowedMimeTypes: ["image/jpeg"],
    });
    await expect(
      blocked.issue(scope, areaId, caseId, evidenceId, "PREVIEW", traceId),
    ).rejects.toEqual(new EvidenceFailure("CONFIGURATION_BLOCKED"));
    expect(repository.audits).toHaveLength(0);
    expect(storage.requests).toHaveLength(0);
  });

  it("fails closed when the read TTL exceeds the technical bound", async () => {
    const blocked = new EvidenceAccessService(
      new FakeAccessRepository(),
      new FakeReadStorage(),
      {
        enabled: true,
        allowedMimeTypes: ["image/jpeg"],
        readUrlTtlSeconds: 3_601,
      },
    );
    await expect(
      blocked.issue(scope, areaId, caseId, evidenceId, "PREVIEW", traceId),
    ).rejects.toEqual(new EvidenceFailure("CONFIGURATION_BLOCKED"));
  });
});
