import { IdempotencyKeySchema } from "@atgt/contracts";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "./idempotency.errors";
import type {
  IdempotencyStore,
  IdempotentExecutionResult,
  JsonValue,
  StoredHttpResponse,
} from "./idempotency.types";
import { hashRequest } from "./request-hash";

export class IdempotencyExecutor {
  constructor(private readonly store: IdempotencyStore) {}

  async execute(
    keyInput: string,
    request: JsonValue,
    expiresAt: Date,
    operation: () => Promise<StoredHttpResponse>,
  ): Promise<IdempotentExecutionResult> {
    const key = IdempotencyKeySchema.parse(keyInput);
    const requestHash = hashRequest(request);
    const claim = await this.store.claim(key, requestHash, expiresAt);

    if (claim.kind === "replay")
      return { response: claim.response, replayed: true };
    if (claim.kind === "conflict") throw new IdempotencyConflictError();
    if (claim.kind === "in_progress") throw new IdempotencyInProgressError();

    try {
      const response = await operation();
      await this.store.complete(key, requestHash, response);
      return { response, replayed: false };
    } catch (error) {
      await this.store.release(key, requestHash);
      throw error;
    }
  }
}
