import * as Keychain from "react-native-keychain";
import {
  SOS_QUEUE_VERSION,
  SosQueueEnvelopeSchema,
  type SosQueueEnvelope,
} from "./model";
import type { EncryptedSosQueueStore } from "./ports";

export const SOS_QUEUE_KEYCHAIN_SERVICE = "vn.gov.lamdong.atgt.sos.queue.v1";

export interface SecureCredentialStore {
  read(service: string): Promise<string | null>;
  write(service: string, value: string): Promise<void>;
}

export class NativeKeychainCredentialStore implements SecureCredentialStore {
  async read(service: string): Promise<string | null> {
    const credential = await Keychain.getGenericPassword({ service });
    return credential ? credential.password : null;
  }

  async write(service: string, value: string): Promise<void> {
    const stored = await Keychain.setGenericPassword(service, value, {
      service,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (!stored) throw new Error("SECURE_QUEUE_WRITE_FAILED");
  }
}

export class KeychainSosQueueStore implements EncryptedSosQueueStore {
  constructor(
    private readonly credentials: SecureCredentialStore,
    private readonly service = SOS_QUEUE_KEYCHAIN_SERVICE,
  ) {}

  async load(): Promise<SosQueueEnvelope> {
    const serialized = await this.credentials.read(this.service);
    if (serialized === null) {
      return { version: SOS_QUEUE_VERSION, items: [] };
    }
    try {
      return SosQueueEnvelopeSchema.parse(JSON.parse(serialized));
    } catch {
      throw new Error("SECURE_QUEUE_CORRUPT");
    }
  }

  async save(envelope: SosQueueEnvelope): Promise<void> {
    const validated = SosQueueEnvelopeSchema.parse(envelope);
    await this.credentials.write(this.service, JSON.stringify(validated));
  }
}
