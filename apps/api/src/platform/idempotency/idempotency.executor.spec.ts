import { randomUUID } from "node:crypto";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "./idempotency.errors";
import { IdempotencyExecutor } from "./idempotency.executor";
import { InMemoryIdempotencyStore } from "./in-memory-idempotency.store";

const future = (): Date => new Date(Date.now() + 60_000);

describe("IdempotencyExecutor", () => {
  it("replays the original response for the same key and body", async () => {
    const executor = new IdempotencyExecutor(new InMemoryIdempotencyStore());
    const key = randomUUID();
    const operation = jest.fn(async () => ({
      status: 202,
      body: { publicCode: "A3KX9M2P7Q4R" },
    }));

    const first = await executor.execute(
      key,
      { latitude: 11.94 },
      future(),
      operation,
    );
    const replay = await executor.execute(
      key,
      { latitude: 11.94 },
      future(),
      operation,
    );

    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ response: first.response, replayed: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("canonicalizes object property order before hashing", async () => {
    const executor = new IdempotencyExecutor(new InMemoryIdempotencyStore());
    const key = randomUUID();
    const operation = jest.fn(async () => ({
      status: 200,
      body: { accepted: true },
    }));

    await executor.execute(
      key,
      { latitude: 11, longitude: 108 },
      future(),
      operation,
    );
    const replay = await executor.execute(
      key,
      { longitude: 108, latitude: 11 },
      future(),
      operation,
    );

    expect(replay.replayed).toBe(true);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("rejects the same key with a different body", async () => {
    const executor = new IdempotencyExecutor(new InMemoryIdempotencyStore());
    const key = randomUUID();
    await executor.execute(key, { value: 1 }, future(), async () => ({
      status: 202,
      body: { accepted: true },
    }));

    await expect(
      executor.execute(key, { value: 2 }, future(), async () => ({
        status: 202,
        body: null,
      })),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("does not run a concurrent duplicate operation", async () => {
    const executor = new IdempotencyExecutor(new InMemoryIdempotencyStore());
    const key = randomUUID();
    let finish: ((value: { status: number; body: null }) => void) | undefined;
    const pending = executor.execute(
      key,
      { value: 1 },
      future(),
      () => new Promise((resolve) => (finish = resolve)),
    );

    await expect(
      executor.execute(key, { value: 1 }, future(), async () => ({
        status: 202,
        body: null,
      })),
    ).rejects.toBeInstanceOf(IdempotencyInProgressError);

    finish?.({ status: 202, body: null });
    await pending;
  });

  it("releases a claim after the operation fails", async () => {
    const executor = new IdempotencyExecutor(new InMemoryIdempotencyStore());
    const key = randomUUID();
    await expect(
      executor.execute(key, { value: 1 }, future(), async () => {
        throw new Error("operation failed");
      }),
    ).rejects.toThrow("operation failed");

    await expect(
      executor.execute(key, { value: 1 }, future(), async () => ({
        status: 202,
        body: null,
      })),
    ).resolves.toMatchObject({ replayed: false });
  });
});
