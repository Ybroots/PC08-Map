import { createHash } from "node:crypto";
import {
  CitizenSessionService,
  InMemoryCitizenSessionStore,
} from "./citizen-session.service";

describe("CitizenSessionService", () => {
  let now: Date;
  let store: InMemoryCitizenSessionStore;
  let service: CitizenSessionService;

  beforeEach(() => {
    now = new Date("2026-08-17T00:00:00.000Z");
    store = new InMemoryCitizenSessionStore();
    service = new CitizenSessionService(store, 60, 15, () => new Date(now));
  });

  it("stores only a token hash and authenticates as citizen_guest", async () => {
    const issued = await service.create("mobile");
    const record = await store.findByTokenHash(
      // The service deliberately does not expose this helper; prove lookup by
      // authenticating instead of persisting the raw credential in the test.
      createHash("sha256").update(issued.session_token).digest("hex"),
    );

    expect(record?.tokenHash).not.toBe(issued.session_token);
    expect(JSON.stringify(record)).not.toContain(issued.session_token);
    await expect(
      service.authenticate(issued.session_token),
    ).resolves.toMatchObject({
      role: "citizen_guest",
      principalId: issued.session_id,
      maxDataClass: "public",
    });
  });

  it("rotates atomically and rejects the previous token", async () => {
    const issued = await service.create("web");
    now = new Date("2026-08-17T00:16:00.000Z");
    const replacement = await service.rotate(issued.session_token);

    expect(replacement.session_id).not.toBe(issued.session_id);
    await expect(
      service.authenticate(issued.session_token),
    ).rejects.toMatchObject({
      code: "REVOKED",
    });
    await expect(
      service.authenticate(replacement.session_token),
    ).resolves.toBeDefined();
  });

  it("allows only one winner for concurrent rotation", async () => {
    const issued = await service.create("mobile");
    const attempts = await Promise.allSettled([
      service.rotate(issued.session_token),
      service.rotate(issued.session_token),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
  });

  it("rejects an expired session", async () => {
    const issued = await service.create("mobile");
    now = new Date("2026-08-17T01:00:00.001Z");
    await expect(
      service.authenticate(issued.session_token),
    ).rejects.toMatchObject({
      code: "EXPIRED",
    });
  });

  it("rejects an unknown token without echoing it", async () => {
    const unknown = "secret-unknown-token";
    let message = "";
    try {
      await service.authenticate(unknown);
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toContain(unknown);
  });
});
