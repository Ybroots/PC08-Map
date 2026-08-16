import { EVENT_ROUTING_KEYS, type EventEnvelope } from "@atgt/contracts";
import type { Pool, PoolClient } from "pg";
import { PostgresInboxStore } from "./inbox-store";
import { PostgresOutboxWriter } from "./outbox-writer";
import { PostgresTransactionManager } from "./transaction-manager";

const EVENT: EventEnvelope = {
  event_id: "018f6f7a-8ca1-7a56-8d4a-f5154d5a3444",
  type: EVENT_ROUTING_KEYS.INCIDENT_RECEIVED,
  version: 1,
  occurred_at: "2026-08-16T00:00:00.000Z",
  trace_id: "0123456789abcdef0123456789abcdef",
  aggregate_id: "018f6f7a-8ca1-7a56-8d4a-f5154d5a3111",
  aggregate_type: "incident",
  data: { state: "RECEIVED" },
};

function transactionHarness() {
  const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [] });
  const release = jest.fn();
  const client = { query, release } as unknown as PoolClient;
  const pool = {
    connect: jest.fn().mockResolvedValue(client),
  } as unknown as Pool;
  return { client, pool, query, release };
}

describe("PostgresTransactionManager", () => {
  it("commits successful work and releases the client", async () => {
    const { client, pool, query, release } = transactionHarness();
    const manager = new PostgresTransactionManager(pool);

    await expect(
      manager.execute(async (transaction) => {
        expect(transaction).toBe(client);
        return "committed";
      }),
    ).resolves.toBe("committed");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back failed work and preserves the original error", async () => {
    const { pool, query, release } = transactionHarness();
    const manager = new PostgresTransactionManager(pool);
    const failure = new Error("work failed");

    await expect(
      manager.execute(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("PostgresOutboxWriter", () => {
  it("validates and writes the complete event routing metadata", async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const writer = new PostgresOutboxWriter();

    await writer.append({ query } as never, EVENT);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("platform.outbox"),
      [
        EVENT.event_id,
        EVENT.aggregate_id,
        EVENT.aggregate_type,
        EVENT.type,
        JSON.stringify(EVENT.data),
        new Date(EVENT.occurred_at),
        EVENT.version,
        EVENT.trace_id,
      ],
    );
  });

  it("rejects an invalid envelope before touching the database", async () => {
    const query = jest.fn();
    const writer = new PostgresOutboxWriter();

    await expect(
      writer.append({ query } as never, {
        ...EVENT,
        trace_id: "not-a-trace-id",
      }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

describe("PostgresInboxStore", () => {
  it("reports whether the consumer won the idempotency claim", async () => {
    const store = new PostgresInboxStore();
    const won = jest
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ message_id: EVENT.event_id }],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      store.claim({ query: won } as never, "worker-a", EVENT),
    ).resolves.toBe(true);
    await expect(
      store.claim({ query: won } as never, "worker-a", EVENT),
    ).resolves.toBe(false);
  });

  it("rejects invalid consumer input before touching the database", async () => {
    const query = jest.fn();
    const store = new PostgresInboxStore();

    await expect(store.claim({ query } as never, "   ", EVENT)).rejects.toThrow(
      "consumerName must be between 1 and 100 characters",
    );
    expect(query).not.toHaveBeenCalled();
  });
});
