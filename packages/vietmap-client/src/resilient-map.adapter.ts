import { createHash } from "node:crypto";
import { ProviderQuality } from "@atgt/contracts";
import { MAP_PROVIDER_APIS } from "./map-provider.port";
import type {
  AddressResult,
  Coordinate,
  MapProviderApi,
  MapProviderPort,
  MatrixInput,
  MatrixResult,
  ProviderCacheStatus,
  ProviderContext,
  ProviderMetadata,
  ReverseInput,
  RouteInput,
  RouteResult,
  SearchInput,
  SearchResult,
} from "./map-provider.port";
import { MapProviderError } from "./provider-error";
import {
  NoopMapProviderTelemetry,
  type MapProviderTelemetry,
} from "./provider-telemetry";

type ProviderValue =
  SearchResult[] | AddressResult | RouteResult | MatrixResult;

interface CacheEntry {
  value: ProviderValue;
  freshUntil: number;
  staleUntil: number;
}

export interface ApiResilienceOptions {
  cacheTtlMs: number;
  maxStaleMs: number;
  failureThreshold: number;
  resetTimeoutMs: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
}

export type MapResilienceOptions = Record<MapProviderApi, ApiResilienceOptions>;

export interface ResilientMapAdapterOptions {
  apis: MapResilienceOptions;
  now?: () => number;
  telemetry?: MapProviderTelemetry;
  random?: () => number;
}

type CircuitState =
  | { status: "CLOSED"; failures: number }
  | { status: "OPEN"; retryAt: number }
  | { status: "HALF_OPEN" };

class CircuitBreaker {
  private state: CircuitState = { status: "CLOSED", failures: 0 };

  constructor(
    private readonly failureThreshold: number,
    private readonly resetTimeoutMs: number,
    private readonly now: () => number,
  ) {}

  beforeCall(): void {
    if (this.state.status === "OPEN") {
      if (this.now() < this.state.retryAt) {
        throw new MapProviderError("CIRCUIT_OPEN", true);
      }
      this.state = { status: "HALF_OPEN" };
      return;
    }
    if (this.state.status === "HALF_OPEN") {
      throw new MapProviderError("CIRCUIT_OPEN", true);
    }
  }

  success(): void {
    this.state = { status: "CLOSED", failures: 0 };
  }

  failure(): void {
    if (this.state.status === "HALF_OPEN") {
      this.state = {
        status: "OPEN",
        retryAt: this.now() + this.resetTimeoutMs,
      };
      return;
    }
    if (this.state.status === "CLOSED") {
      const failures = this.state.failures + 1;
      this.state =
        failures >= this.failureThreshold
          ? { status: "OPEN", retryAt: this.now() + this.resetTimeoutMs }
          : { status: "CLOSED", failures };
    }
  }
}

function assertCoordinate(coordinate: Coordinate): void {
  const [longitude, latitude] = coordinate;
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new MapProviderError("INVALID_INPUT", false);
  }
}

function rounded(coordinate: Coordinate): Coordinate {
  return [Number(coordinate[0].toFixed(5)), Number(coordinate[1].toFixed(5))];
}

/** Returns an opaque key; raw searches and exact coordinates are never keys. */
export function createSanitizedCacheKey(
  api: MapProviderApi,
  input: SearchInput | ReverseInput | RouteInput | MatrixInput,
): string {
  let canonical: unknown;
  switch (api) {
    case "search": {
      const search = input as SearchInput;
      canonical = {
        queryDigest: createHash("sha256")
          .update(search.query.trim().toLocaleLowerCase("vi"))
          .digest("hex"),
        center: search.center ? rounded(search.center) : undefined,
        limit: search.limit,
      };
      break;
    }
    case "reverse": {
      const reverse = input as ReverseInput;
      canonical = rounded([reverse.longitude, reverse.latitude]);
      break;
    }
    case "route": {
      const route = input as RouteInput;
      canonical = {
        origin: rounded(route.origin),
        destination: rounded(route.destination),
        vehicle: route.vehicle,
      };
      break;
    }
    case "matrix": {
      const matrix = input as MatrixInput;
      canonical = {
        origins: matrix.origins.map(rounded),
        destinations: matrix.destinations.map(rounded),
        vehicle: matrix.vehicle,
      };
      break;
    }
  }
  return `${api}:${createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")}`;
}

function safeSearchInput(input: SearchInput): SearchInput {
  if (typeof input.query !== "string" || input.query.trim().length === 0) {
    throw new MapProviderError("INVALID_INPUT", false);
  }
  if (input.center) assertCoordinate(input.center);
  if (
    input.limit !== undefined &&
    (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50)
  ) {
    throw new MapProviderError("INVALID_INPUT", false);
  }
  return {
    query: input.query.trim(),
    ...(input.center ? { center: [...input.center] as Coordinate } : {}),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  };
}

function safeProviderContext(ctx: ProviderContext): ProviderContext {
  if (
    typeof ctx.traceId !== "string" ||
    ctx.traceId.trim().length === 0 ||
    ctx.traceId.length > 128 ||
    !Number.isInteger(ctx.timeoutMs) ||
    ctx.timeoutMs < 1 ||
    (ctx.locale !== undefined && ctx.locale !== "vi" && ctx.locale !== "en")
  ) {
    throw new MapProviderError("INVALID_INPUT", false);
  }
  return {
    traceId: ctx.traceId.trim(),
    timeoutMs: ctx.timeoutMs,
    ...(ctx.locale ? { locale: ctx.locale } : {}),
  };
}

function safeReverseInput(input: ReverseInput): ReverseInput {
  assertCoordinate([input.longitude, input.latitude]);
  return { longitude: input.longitude, latitude: input.latitude };
}

function safeRouteInput(input: RouteInput): RouteInput {
  assertCoordinate(input.origin);
  assertCoordinate(input.destination);
  return {
    origin: [...input.origin] as Coordinate,
    destination: [...input.destination] as Coordinate,
    ...(input.vehicle ? { vehicle: input.vehicle } : {}),
  };
}

function safeMatrixInput(input: MatrixInput): MatrixInput {
  if (input.origins.length === 0 || input.destinations.length === 0) {
    throw new MapProviderError("INVALID_INPUT", false);
  }
  input.origins.forEach(assertCoordinate);
  input.destinations.forEach(assertCoordinate);
  return {
    origins: input.origins.map((coordinate) => [...coordinate] as Coordinate),
    destinations: input.destinations.map(
      (coordinate) => [...coordinate] as Coordinate,
    ),
    ...(input.vehicle ? { vehicle: input.vehicle } : {}),
  };
}

function decorate<T extends ProviderValue>(
  value: T,
  cacheStatus: ProviderCacheStatus,
  quality: ProviderMetadata["quality"],
  latencyMs: number,
): T {
  const decorateOne = <R extends ProviderMetadata>(result: R): R => {
    const decorated = {
      ...result,
      cacheStatus,
      quality,
      latencyMs,
    } as R & { isDegraded?: boolean };
    if (Object.hasOwn(result, "isDegraded")) {
      decorated.isDegraded = quality === ProviderQuality.DEGRADED;
    }
    return decorated;
  };

  return (
    Array.isArray(value)
      ? value.map((result) => decorateOne(result))
      : decorateOne(value as Exclude<ProviderValue, SearchResult[]>)
  ) as T;
}

function normalizeError(error: unknown): MapProviderError {
  return error instanceof MapProviderError
    ? error
    : new MapProviderError("UPSTREAM_UNAVAILABLE", true);
}

export class ResilientMapAdapter implements MapProviderPort {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly breakers: Record<MapProviderApi, CircuitBreaker>;
  private readonly now: () => number;
  private readonly telemetry: MapProviderTelemetry;
  private readonly random: () => number;

  constructor(
    private readonly delegate: MapProviderPort,
    private readonly options: ResilientMapAdapterOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.telemetry = options.telemetry ?? new NoopMapProviderTelemetry();
    this.random = options.random ?? Math.random;
    for (const api of MAP_PROVIDER_APIS) {
      const apiOptions = options.apis[api];
      if (
        apiOptions.cacheTtlMs < 0 ||
        apiOptions.maxStaleMs < 0 ||
        !Number.isInteger(apiOptions.failureThreshold) ||
        apiOptions.failureThreshold < 1 ||
        !Number.isInteger(apiOptions.resetTimeoutMs) ||
        apiOptions.resetTimeoutMs < 1 ||
        !Number.isInteger(apiOptions.maxAttempts) ||
        apiOptions.maxAttempts < 1 ||
        !Number.isInteger(apiOptions.retryBaseDelayMs) ||
        apiOptions.retryBaseDelayMs < 0
      ) {
        throw new Error(`Invalid resilience options for ${api}`);
      }
    }
    this.breakers = Object.fromEntries(
      MAP_PROVIDER_APIS.map((api) => [
        api,
        new CircuitBreaker(
          options.apis[api].failureThreshold,
          options.apis[api].resetTimeoutMs,
          this.now,
        ),
      ]),
    ) as Record<MapProviderApi, CircuitBreaker>;
  }

  search(input: SearchInput, ctx: ProviderContext): Promise<SearchResult[]> {
    const safe = safeSearchInput(input);
    const safeContext = safeProviderContext(ctx);
    return this.execute("search", safe, safeContext, () =>
      this.delegate.search(safe, safeContext),
    );
  }

  reverse(input: ReverseInput, ctx: ProviderContext): Promise<AddressResult> {
    const safe = safeReverseInput(input);
    const safeContext = safeProviderContext(ctx);
    return this.execute("reverse", safe, safeContext, () =>
      this.delegate.reverse(safe, safeContext),
    );
  }

  route(input: RouteInput, ctx: ProviderContext): Promise<RouteResult> {
    const safe = safeRouteInput(input);
    const safeContext = safeProviderContext(ctx);
    return this.execute("route", safe, safeContext, () =>
      this.delegate.route(safe, safeContext),
    );
  }

  matrix(input: MatrixInput, ctx: ProviderContext): Promise<MatrixResult> {
    const safe = safeMatrixInput(input);
    const safeContext = safeProviderContext(ctx);
    return this.execute("matrix", safe, safeContext, () =>
      this.delegate.matrix(safe, safeContext),
    );
  }

  private async execute<T extends ProviderValue>(
    api: MapProviderApi,
    input: SearchInput | ReverseInput | RouteInput | MatrixInput,
    ctx: ProviderContext,
    call: () => Promise<T>,
  ): Promise<T> {
    const key = createSanitizedCacheKey(api, input);
    const cached = this.cache.get(key);
    const startedAt = this.now();
    if (cached && startedAt < cached.freshUntil) {
      this.telemetry.recordCall({
        api,
        latencyMs: 0,
        cacheStatus: "HIT",
        outcome: "success",
      });
      return decorate(
        structuredClone(cached.value) as T,
        "HIT",
        ProviderQuality.CACHED,
        0,
      );
    }

    try {
      this.breakers[api].beforeCall();
      const result = await this.attempt(
        call,
        ctx.timeoutMs,
        this.options.apis[api],
      );
      this.breakers[api].success();
      const completedAt = this.now();
      const latencyMs = Math.max(0, completedAt - startedAt);
      const decorated = decorate(
        result,
        "MISS",
        ProviderQuality.LIVE,
        latencyMs,
      );
      const cacheTtlMs = this.options.apis[api].cacheTtlMs;
      const maxStaleMs = this.options.apis[api].maxStaleMs;
      if (cacheTtlMs + maxStaleMs > 0) {
        this.cache.set(key, {
          value: structuredClone(decorated),
          freshUntil: completedAt + cacheTtlMs,
          staleUntil: completedAt + cacheTtlMs + maxStaleMs,
        });
      }
      this.telemetry.recordCall({
        api,
        latencyMs,
        cacheStatus: "MISS",
        outcome: "success",
      });
      return decorated;
    } catch (cause) {
      const error = normalizeError(cause);
      if (error.code !== "CIRCUIT_OPEN") this.breakers[api].failure();
      const latencyMs = Math.max(0, this.now() - startedAt);
      if (cached && this.now() < cached.staleUntil) {
        this.telemetry.recordCall({
          api,
          latencyMs,
          cacheStatus: "STALE",
          outcome: "degraded",
          errorCode: error.code,
        });
        return decorate(
          structuredClone(cached.value) as T,
          "STALE",
          ProviderQuality.DEGRADED,
          latencyMs,
        );
      }
      this.telemetry.recordCall({
        api,
        latencyMs,
        cacheStatus: "MISS",
        outcome: "failure",
        errorCode: error.code,
      });
      throw error;
    }
  }

  private async attempt<T>(
    call: () => Promise<T>,
    timeoutMs: number,
    options: ApiResilienceOptions,
  ): Promise<T> {
    const deadline = performance.now() + timeoutMs;
    let lastError = new MapProviderError("UPSTREAM_UNAVAILABLE", true);
    for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
      try {
        const remainingMs = Math.floor(deadline - performance.now());
        if (remainingMs < 1) throw new MapProviderError("TIMEOUT", false);
        return await this.withTimeout(call(), remainingMs);
      } catch (cause) {
        lastError = normalizeError(cause);
        if (!lastError.retryable || attempt === options.maxAttempts) break;
        const remainingMs = Math.floor(deadline - performance.now());
        if (remainingMs < 1) {
          lastError = new MapProviderError("TIMEOUT", false);
          break;
        }
        const exponentialDelay = options.retryBaseDelayMs * 2 ** (attempt - 1);
        const jitteredDelay = Math.floor(
          exponentialDelay * (0.5 + this.random()),
        );
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(jitteredDelay, remainingMs)),
        );
      }
    }
    throw lastError;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new MapProviderError("TIMEOUT", false)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
