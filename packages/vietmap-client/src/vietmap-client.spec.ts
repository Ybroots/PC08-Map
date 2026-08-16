import { ProviderQuality } from "@atgt/contracts";
import { FakeMapAdapter } from "./fake-map.adapter";
import type { MapProviderApi, SearchInput } from "./map-provider.port";
import { MapProviderError } from "./provider-error";
import {
  type MapProviderTelemetry,
  ProviderQuotaTracker,
} from "./provider-telemetry";
import {
  createSanitizedCacheKey,
  type MapResilienceOptions,
  ResilientMapAdapter,
} from "./resilient-map.adapter";

const context = { traceId: "trace-test", timeoutMs: 25 };

function resilience(
  overrides: Partial<MapResilienceOptions[MapProviderApi]> = {},
): MapResilienceOptions {
  const value = {
    cacheTtlMs: 10,
    maxStaleMs: 20,
    failureThreshold: 2,
    resetTimeoutMs: 50,
    maxAttempts: 1,
    retryBaseDelayMs: 1,
    ...overrides,
  };
  return {
    search: { ...value },
    reverse: { ...value },
    route: { ...value },
    matrix: { ...value },
  };
}

describe("FakeMapAdapter", () => {
  it("returns deterministic matrix data and complete provider metadata", async () => {
    const adapter = new FakeMapAdapter({
      now: () => new Date("2026-08-17T00:00:00.000Z"),
    });

    const result = await adapter.matrix(
      {
        origins: [
          [108.43, 11.94],
          [108.44, 11.95],
        ],
        destinations: [
          [108.45, 11.96],
          [108.46, 11.97],
        ],
      },
      context,
    );

    expect(result.durations).toEqual([
      [300, 330],
      [360, 390],
    ]);
    expect(result).toMatchObject({
      provider: "fake",
      apiVersion: "fake-v1",
      observedAt: "2026-08-17T00:00:00.000Z",
      cacheStatus: "BYPASS",
      quality: ProviderQuality.LIVE,
    });
  });
});

describe("ResilientMapAdapter", () => {
  it("uses an opaque cache key and strips unexpected PII/business fields", async () => {
    const rawQuery = "Nha rieng cua Nguyen Van A";
    expect(
      createSanitizedCacheKey("search", { query: rawQuery }),
    ).not.toContain(rawQuery);

    const delegate = new FakeMapAdapter();
    const search = jest.spyOn(delegate, "search");
    const adapter = new ResilientMapAdapter(delegate, {
      apis: resilience(),
    });
    const unsafe = {
      query: "Da Lat",
      incidentId: "internal-incident-id",
      publicCode: "SECRET-CODE",
      citizenIdentity: "person",
    } as SearchInput;

    await adapter.search(unsafe, {
      ...context,
      citizenIdentity: "person",
      caseNotes: "private notes",
    } as typeof context);

    expect(search.mock.calls[0]?.[0]).toEqual({ query: "Da Lat" });
    expect(search.mock.calls[0]?.[1]).toEqual(context);
  });

  it("returns a fresh cache hit with explicit CACHED quality", async () => {
    const delegate = new FakeMapAdapter();
    const adapter = new ResilientMapAdapter(delegate, {
      apis: resilience(),
    });

    await adapter.reverse({ longitude: 108.43, latitude: 11.94 }, context);
    const cached = await adapter.reverse(
      { longitude: 108.43, latitude: 11.94 },
      context,
    );

    expect(delegate.getCallCount()).toBe(1);
    expect(cached).toMatchObject({
      cacheStatus: "HIT",
      quality: ProviderQuality.CACHED,
    });
  });

  it("performs no cache read or write when cache and stale windows are zero", async () => {
    const delegate = new FakeMapAdapter();
    const adapter = new ResilientMapAdapter(delegate, {
      apis: resilience({ cacheTtlMs: 0, maxStaleMs: 0 }),
    });

    await adapter.reverse({ longitude: 108.43, latitude: 11.94 }, context);
    await adapter.reverse({ longitude: 108.43, latitude: 11.94 }, context);

    expect(delegate.getCallCount()).toBe(2);
  });

  it("uses bounded stale data with explicit DEGRADED quality", async () => {
    let now = 0;
    const delegate = new FakeMapAdapter();
    const adapter = new ResilientMapAdapter(delegate, {
      apis: resilience(),
      now: () => now,
    });
    const input = {
      origin: [108.43, 11.94] as const,
      destination: [108.45, 11.95] as const,
    };

    await adapter.route(input, context);
    now = 11;
    delegate.simulateFailure = true;
    const fallback = await adapter.route(input, context);

    expect(fallback).toMatchObject({
      cacheStatus: "STALE",
      quality: ProviderQuality.DEGRADED,
      isDegraded: true,
    });

    now = 31;
    await expect(adapter.route(input, context)).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("times out within the caller budget", async () => {
    const delegate = new FakeMapAdapter();
    delegate.simulateLatencyMs = 30;
    const adapter = new ResilientMapAdapter(delegate, {
      apis: resilience(),
    });

    await expect(
      adapter.search({ query: "Da Lat" }, { ...context, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it.each([
    ["RATE_LIMITED", false, 1],
    ["MALFORMED_RESPONSE", false, 1],
    ["UPSTREAM_UNAVAILABLE", true, 2],
  ] as const)(
    "handles %s with bounded retry behavior",
    async (code, retryable, expectedCalls) => {
      const delegate = new FakeMapAdapter();
      const search = jest
        .spyOn(delegate, "search")
        .mockRejectedValue(new MapProviderError(code, retryable));
      const adapter = new ResilientMapAdapter(delegate, {
        apis: resilience({ maxAttempts: 2 }),
      });

      await expect(
        adapter.search({ query: "Da Lat" }, context),
      ).rejects.toMatchObject({ code });
      expect(search).toHaveBeenCalledTimes(expectedCalls);
    },
  );

  it("opens per API and recovers through one half-open probe", async () => {
    let now = 0;
    const delegate = new FakeMapAdapter();
    delegate.simulateFailure = true;
    const adapter = new ResilientMapAdapter(delegate, {
      apis: resilience(),
      now: () => now,
    });

    for (let failure = 0; failure < 2; failure += 1) {
      await expect(
        adapter.search({ query: `failure-${failure}` }, context),
      ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    }
    await expect(
      adapter.search({ query: "circuit-open" }, context),
    ).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    expect(delegate.getCallCount()).toBe(2);

    now = 50;
    delegate.simulateFailure = false;
    const recovered = await adapter.search({ query: "recovered" }, context);
    expect(recovered[0]?.quality).toBe(ProviderQuality.LIVE);
  });
});

describe("ProviderQuotaTracker", () => {
  it("emits each configured level once per provider period without inventing a limit", () => {
    const alerts: unknown[] = [];
    const telemetry: MapProviderTelemetry = {
      recordCall: jest.fn(),
      recordQuotaAlert: (alert) => alerts.push(alert),
    };
    const tracker = new ProviderQuotaTracker(telemetry, [70, 85, 95]);
    const observation = {
      api: "matrix" as const,
      environment: "sandbox",
      keyAlias: "approved-alias",
      periodId: "provider-period-1",
      limit: 1000,
    };

    tracker.observe({ ...observation, used: 699 });
    tracker.observe({ ...observation, used: 700 });
    tracker.observe({ ...observation, used: 960 });
    tracker.observe({ ...observation, used: 990 });

    expect(alerts).toHaveLength(3);
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ thresholdPercent: 70 }),
        expect.objectContaining({ thresholdPercent: 85 }),
        expect.objectContaining({ thresholdPercent: 95 }),
      ]),
    );

    tracker.observe({
      ...observation,
      periodId: "provider-period-2",
      used: 700,
    });
    expect(alerts).toHaveLength(4);
  });
});
