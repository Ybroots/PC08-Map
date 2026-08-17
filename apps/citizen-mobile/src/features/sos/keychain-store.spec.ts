jest.mock("react-native-keychain", () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only" },
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
}));

import {
  KeychainSosQueueStore,
  SOS_QUEUE_KEYCHAIN_SERVICE,
  type SecureCredentialStore,
} from "./keychain-store";
import { SOS_QUEUE_VERSION, type SosQueueEnvelope } from "./model";

class FakeCredentialStore implements SecureCredentialStore {
  value: string | null = null;
  read = jest.fn(async () => this.value);
  write = jest.fn(async (_service: string, value: string) => {
    this.value = value;
  });
}

describe("KeychainSosQueueStore", () => {
  it("round-trips the versioned queue only through secure credentials", async () => {
    const credentials = new FakeCredentialStore();
    const store = new KeychainSosQueueStore(credentials);
    const envelope: SosQueueEnvelope = {
      version: SOS_QUEUE_VERSION,
      items: [],
    };

    await store.save(envelope);
    await expect(store.load()).resolves.toEqual(envelope);
    expect(credentials.write).toHaveBeenCalledWith(
      SOS_QUEUE_KEYCHAIN_SERVICE,
      JSON.stringify(envelope),
    );
  });

  it("fails closed and preserves corrupt secure data for recovery", async () => {
    const credentials = new FakeCredentialStore();
    credentials.value = "not-json";
    const store = new KeychainSosQueueStore(credentials);

    await expect(store.load()).rejects.toThrow("SECURE_QUEUE_CORRUPT");
    expect(credentials.write).not.toHaveBeenCalled();
    expect(credentials.value).toBe("not-json");
  });
});
