import { randomUUID } from "node:crypto";
import {
  EVENT_ROUTING_KEYS,
  type EvidenceScanRequestedEvent,
} from "@atgt/contracts";
import { EvidenceMediaProcessor } from "./evidence-media.processor";
import { FakeAntivirusAdapter } from "./fake-antivirus.adapter";
import {
  EvidenceMediaFailure,
  type AntivirusPort,
  type EvidenceDerivativePort,
  type EvidenceMediaStoragePort,
  type EvidenceProcessingOutcome,
  type EvidenceUploadWorkItem,
  type EvidenceWorkCoordinatorPort,
  type EvidenceWorkLease,
} from "./evidence-media.types";
import { sha256 } from "./media-validation";

const evidenceId = "00000000-0000-4000-8000-000000000111";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function event(): EvidenceScanRequestedEvent {
  return {
    event_id: randomUUID(),
    type: EVENT_ROUTING_KEYS.EVIDENCE_SCAN_REQUESTED,
    version: 1,
    occurred_at: "2026-08-19T00:00:00.000Z",
    trace_id: "a".repeat(32),
    aggregate_id: evidenceId,
    aggregate_type: "evidence",
    data: { evidence_id: evidenceId, state: "SCAN_PENDING" },
  };
}

class FakeLease implements EvidenceWorkLease {
  outcome?: EvidenceProcessingOutcome;
  released = false;
  completeCalls = 0;

  constructor(readonly upload: EvidenceUploadWorkItem | null) {}

  async load(): Promise<EvidenceUploadWorkItem | null> {
    return this.upload;
  }

  async complete(
    _event: EvidenceScanRequestedEvent,
    outcome?: EvidenceProcessingOutcome,
  ): Promise<"PROCESSED"> {
    this.completeCalls += 1;
    this.outcome = outcome;
    return "PROCESSED";
  }

  async release(): Promise<void> {
    this.released = true;
  }
}

class FakeCoordinator implements EvidenceWorkCoordinatorPort {
  constructor(readonly lease: FakeLease | null) {}
  async tryAcquire(): Promise<EvidenceWorkLease | null> {
    return this.lease;
  }
}

class FakeStorage implements EvidenceMediaStoragePort {
  originalWrites = 0;
  derivativeWrites = 0;
  failRead = false;

  constructor(readonly bytes = jpeg) {}

  async readQuarantine(): Promise<Buffer> {
    if (this.failRead) {
      throw new EvidenceMediaFailure("PROVIDER_UNAVAILABLE", true);
    }
    return this.bytes;
  }

  async storeOriginalImmutable(): Promise<void> {
    this.originalWrites += 1;
  }

  async storeDerivativeImmutable(): Promise<void> {
    this.derivativeWrites += 1;
  }
}

class FakeDerivative implements EvidenceDerivativePort {
  calls = 0;
  async create(): Promise<Buffer> {
    this.calls += 1;
    return Buffer.from("derivative");
  }
}

function upload(
  overrides: Partial<EvidenceUploadWorkItem> = {},
): EvidenceUploadWorkItem {
  return {
    evidenceId,
    state: "SCAN_PENDING",
    quarantineObjectKey: "quarantine/synthetic/object",
    declaredSha256: sha256(jpeg),
    declaredMime: "image/jpeg",
    declaredSizeBytes: jpeg.length,
    ...overrides,
  };
}

describe("EvidenceMediaProcessor", () => {
  it("stores exact clean media and completes READY", async () => {
    const lease = new FakeLease(upload());
    const storage = new FakeStorage();
    const derivative = new FakeDerivative();
    const processor = new EvidenceMediaProcessor(
      new FakeCoordinator(lease),
      storage,
      new FakeAntivirusAdapter(),
      derivative,
      1024,
    );

    await expect(processor.process(event())).resolves.toBe("PROCESSED");
    expect(lease.outcome).toMatchObject({
      kind: "READY",
      sha256: sha256(jpeg),
      mime: "image/jpeg",
      sizeBytes: jpeg.length,
      scanEngine: "atgt-fake-eicar",
      originalObjectKey: `original/${evidenceId}`,
      derivativeObjectKey: `derivative/${evidenceId}.png`,
    });
    expect(storage.originalWrites).toBe(1);
    expect(storage.derivativeWrites).toBe(1);
    expect(derivative.calls).toBe(1);
    expect(lease.released).toBe(true);
  });

  it.each([
    ["size", { declaredSizeBytes: jpeg.length + 1 }, "SIZE_MISMATCH"],
    ["hash", { declaredSha256: "b".repeat(64) }, "HASH_MISMATCH"],
    ["mime", { declaredMime: "image/png" }, "MIME_MISMATCH"],
    ["unsupported", { declaredMime: "image/gif" }, "UNSUPPORTED_MEDIA"],
  ])(
    "rejects %s mismatch before creating readable objects",
    async (_name, override, rejectionCode) => {
      const lease = new FakeLease(upload(override));
      const storage = new FakeStorage();
      const derivative = new FakeDerivative();
      const processor = new EvidenceMediaProcessor(
        new FakeCoordinator(lease),
        storage,
        new FakeAntivirusAdapter(),
        derivative,
        1024,
      );
      await processor.process(event());
      expect(lease.outcome).toMatchObject({ kind: "REJECTED", rejectionCode });
      expect(storage.originalWrites).toBe(0);
      expect(storage.derivativeWrites).toBe(0);
      expect(derivative.calls).toBe(0);
    },
  );

  it("keeps EICAR in quarantine and records only a stable rejection", async () => {
    const eicar = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.from(
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      ),
    ]);
    const lease = new FakeLease(
      upload({
        declaredSha256: sha256(eicar),
        declaredSizeBytes: eicar.length,
      }),
    );
    const storage = new FakeStorage(eicar);
    const processor = new EvidenceMediaProcessor(
      new FakeCoordinator(lease),
      storage,
      new FakeAntivirusAdapter(),
      new FakeDerivative(),
      1024,
    );
    await processor.process(event());
    expect(lease.outcome).toEqual({
      kind: "REJECTED",
      rejectionCode: "MALWARE_DETECTED",
      scanEngine: "atgt-fake-eicar",
      scanEngineVersion: "1",
    });
    expect(storage.originalWrites).toBe(0);
    expect(storage.derivativeWrites).toBe(0);
  });

  it("releases the claim and leaves state pending on provider failure", async () => {
    const lease = new FakeLease(upload());
    const storage = new FakeStorage();
    storage.failRead = true;
    const processor = new EvidenceMediaProcessor(
      new FakeCoordinator(lease),
      storage,
      new FakeAntivirusAdapter(),
      new FakeDerivative(),
      1024,
    );
    await expect(processor.process(event())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
    });
    expect(lease.completeCalls).toBe(0);
    expect(lease.released).toBe(true);
  });

  it("rejects an immutable destination conflict without overwriting it", async () => {
    const lease = new FakeLease(upload());
    const storage = new FakeStorage();
    storage.storeOriginalImmutable = async () => {
      throw new EvidenceMediaFailure("IMMUTABLE_OBJECT_CONFLICT", false);
    };
    const processor = new EvidenceMediaProcessor(
      new FakeCoordinator(lease),
      storage,
      new FakeAntivirusAdapter(),
      new FakeDerivative(),
      1024,
    );
    await expect(processor.process(event())).resolves.toBe("PROCESSED");
    expect(lease.outcome).toMatchObject({
      kind: "REJECTED",
      rejectionCode: "IMMUTABLE_OBJECT_CONFLICT",
    });
  });

  it("skips a concurrently locked upload without touching providers", async () => {
    const storage = new FakeStorage();
    const antivirus: AntivirusPort = {
      scan: jest.fn(),
    };
    const processor = new EvidenceMediaProcessor(
      new FakeCoordinator(null),
      storage,
      antivirus,
      new FakeDerivative(),
      1024,
    );
    await expect(processor.process(event())).resolves.toBe("SKIPPED_LOCKED");
    expect(antivirus.scan).not.toHaveBeenCalled();
  });
});
