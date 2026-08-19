import type {
  FinalizeEvidenceUpload,
  InitiateEvidenceUpload,
} from "@atgt/contracts";
import { EvidenceService } from "./evidence.service";
import {
  EvidenceFailure,
  type CreateEvidenceUploadProposal,
  type EvidenceRepositoryPort,
  type EvidenceStoragePort,
  type EvidenceUploadRecord,
} from "./evidence.types";

const now = new Date("2026-08-17T08:00:00.000Z");
const traceId = "a".repeat(32);
const input: InitiateEvidenceUpload = {
  declared_mime: "image/jpeg",
  declared_size_bytes: 4,
  declared_sha256: "b".repeat(64),
};

class FakeRepository implements EvidenceRepositoryPort {
  proposal?: CreateEvidenceUploadProposal;
  record?: EvidenceUploadRecord;
  finalizedAt = now;
  finalizeCalls = 0;

  async createOrReplay(
    declaration: InitiateEvidenceUpload,
    proposal: CreateEvidenceUploadProposal,
  ): Promise<EvidenceUploadRecord> {
    this.proposal = proposal;
    return (
      this.record ?? {
        uploadId: proposal.uploadId,
        quarantineObjectKey: proposal.quarantineObjectKey,
        declaredSha256: declaration.declared_sha256,
        declaredMime: declaration.declared_mime,
        declaredSizeBytes: declaration.declared_size_bytes,
        state: "INITIATED",
        expiresAt: proposal.expiresAt,
      }
    );
  }

  async getForFinalize(): Promise<EvidenceUploadRecord | null> {
    return this.record ?? null;
  }

  async finalize(
    _uploadId: string,
    _capabilityHash: string,
    _input: FinalizeEvidenceUpload,
  ): Promise<Date> {
    this.finalizeCalls += 1;
    return this.finalizedAt;
  }
}

class FakeStorage implements EvidenceStoragePort {
  inspected = 0;
  facts = { mime: "image/jpeg", sizeBytes: 4 };

  async createUploadUrl(): Promise<string> {
    return "http://storage.test/quarantine/signed";
  }

  async inspectQuarantineObject(): Promise<{
    mime: string;
    sizeBytes: number;
  }> {
    this.inspected += 1;
    return this.facts;
  }
}

function service(
  repository = new FakeRepository(),
  storage = new FakeStorage(),
): EvidenceService {
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ];
  return new EvidenceService(
    repository,
    storage,
    {
      enabled: true,
      allowedMimeTypes: ["image/jpeg"],
      maxBytes: 8,
      uploadUrlTtlSeconds: 300,
      readUrlTtlSeconds: 120,
      capabilitySecret: "local-test-capability-secret-32-characters",
    },
    () => new Date(now),
    () => ids.shift()!,
  );
}

describe("EvidenceService", () => {
  it("creates only a server-generated quarantine key and stores a capability hash", async () => {
    const repository = new FakeRepository();
    const result = await service(repository).initiate(
      input,
      "123e4567-e89b-42d3-a456-426614174000",
      traceId,
    );
    expect(result).toMatchObject({
      upload_id: "00000000-0000-4000-8000-000000000001",
      upload_method: "PUT",
      upload_url: "http://storage.test/quarantine/signed",
    });
    expect(repository.proposal?.quarantineObjectKey).toBe(
      "quarantine/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003",
    );
    expect(repository.proposal?.capabilityHash).toMatch(/^[0-9a-f]{64}$/);
    expect(repository.proposal?.capabilityHash).not.toContain(
      result.upload_capability,
    );
    expect(JSON.stringify(result)).not.toContain("object_key");
  });

  it("fails closed on missing policy, disallowed MIME and excessive size", async () => {
    const blocked = new EvidenceService(
      new FakeRepository(),
      new FakeStorage(),
      { enabled: false, allowedMimeTypes: [] },
    );
    await expect(
      blocked.initiate(input, "123e4567-e89b-42d3-a456-426614174000", traceId),
    ).rejects.toEqual(new EvidenceFailure("CONFIGURATION_BLOCKED"));
    await expect(
      service().initiate(
        { ...input, declared_mime: "image/png" },
        "123e4567-e89b-42d3-a456-426614174000",
        traceId,
      ),
    ).rejects.toEqual(new EvidenceFailure("MIME_NOT_ALLOWED"));
    await expect(
      service().initiate(
        { ...input, declared_size_bytes: 9 },
        "123e4567-e89b-42d3-a456-426614174000",
        traceId,
      ),
    ).rejects.toEqual(new EvidenceFailure("SIZE_EXCEEDED"));
  });

  it("checks quarantine facts before finalizing and skips provider calls on replay", async () => {
    const repository = new FakeRepository();
    repository.record = {
      uploadId: "00000000-0000-4000-8000-000000000001",
      quarantineObjectKey: "quarantine/internal-only",
      declaredSha256: input.declared_sha256,
      declaredMime: input.declared_mime,
      declaredSizeBytes: input.declared_size_bytes,
      state: "INITIATED",
      expiresAt: new Date(now.getTime() + 300_000),
    };
    const storage = new FakeStorage();
    const result = await service(repository, storage).finalize(
      repository.record.uploadId,
      "c".repeat(43),
      { observed_sha256: input.declared_sha256 },
      traceId,
    );
    expect(result).toEqual({
      evidence_id: repository.record.uploadId,
      state: "SCAN_PENDING",
      accepted_at: now.toISOString(),
    });
    expect(storage.inspected).toBe(1);
    expect(repository.finalizeCalls).toBe(1);

    repository.record = {
      ...repository.record,
      state: "SCAN_PENDING",
      finalizedAt: now,
    };
    await service(repository, storage).finalize(
      repository.record.uploadId,
      "c".repeat(43),
      { observed_sha256: input.declared_sha256 },
      traceId,
    );
    expect(storage.inspected).toBe(1);
  });

  it("rejects hash, MIME and size mismatches before the scan request", async () => {
    const repository = new FakeRepository();
    repository.record = {
      uploadId: "00000000-0000-4000-8000-000000000001",
      quarantineObjectKey: "quarantine/internal-only",
      declaredSha256: input.declared_sha256,
      declaredMime: input.declared_mime,
      declaredSizeBytes: input.declared_size_bytes,
      state: "INITIATED",
      expiresAt: new Date(now.getTime() + 300_000),
    };
    const storage = new FakeStorage();
    await expect(
      service(repository, storage).finalize(
        repository.record.uploadId,
        "c".repeat(43),
        { observed_sha256: "d".repeat(64) },
        traceId,
      ),
    ).rejects.toEqual(new EvidenceFailure("HASH_MISMATCH"));
    storage.facts = { mime: "image/png", sizeBytes: 4 };
    await expect(
      service(repository, storage).finalize(
        repository.record.uploadId,
        "c".repeat(43),
        { observed_sha256: input.declared_sha256 },
        traceId,
      ),
    ).rejects.toEqual(new EvidenceFailure("MIME_NOT_ALLOWED"));
    storage.facts = { mime: "image/jpeg", sizeBytes: 3 };
    await expect(
      service(repository, storage).finalize(
        repository.record.uploadId,
        "c".repeat(43),
        { observed_sha256: input.declared_sha256 },
        traceId,
      ),
    ).rejects.toEqual(new EvidenceFailure("SIZE_EXCEEDED"));
    expect(repository.finalizeCalls).toBe(0);
  });
});
