import type {
  ClaimResult,
  IdempotencyStore,
  StoredHttpResponse,
} from "./idempotency.types";

interface Entry {
  requestHash: string;
  expiresAt: Date;
  response?: StoredHttpResponse;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  async claim(
    key: string,
    requestHash: string,
    expiresAt: Date,
  ): Promise<ClaimResult> {
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt.getTime() <= Date.now())
      this.entries.delete(key);

    const active = this.entries.get(key);
    if (!active) {
      this.entries.set(key, { requestHash, expiresAt });
      return { kind: "acquired" };
    }
    if (active.requestHash !== requestHash) return { kind: "conflict" };
    if (!active.response) return { kind: "in_progress" };
    return { kind: "replay", response: active.response };
  }

  async complete(
    key: string,
    requestHash: string,
    response: StoredHttpResponse,
  ): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry || entry.requestHash !== requestHash || entry.response) {
      throw new Error("Cannot complete an unclaimed idempotency key");
    }
    entry.response = response;
  }

  async release(key: string, requestHash: string): Promise<void> {
    const entry = this.entries.get(key);
    if (entry?.requestHash === requestHash && !entry.response)
      this.entries.delete(key);
  }
}
