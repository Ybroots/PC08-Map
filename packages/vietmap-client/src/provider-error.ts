import type { MapProviderPort } from "./map-provider.port";

export type MapProviderErrorCode =
  | "CONFIGURATION_BLOCKED"
  | "INVALID_INPUT"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "MALFORMED_RESPONSE"
  | "CIRCUIT_OPEN";

/** Sanitized provider failure. It intentionally carries no upstream payload. */
export class MapProviderError extends Error {
  constructor(
    readonly code: MapProviderErrorCode,
    readonly retryable: boolean,
  ) {
    super(`Map provider request failed: ${code}`);
    this.name = "MapProviderError";
  }
}

/** Keeps the core API healthy while all real provider calls fail closed. */
export class ConfigurationBlockedMapAdapter implements MapProviderPort {
  private blocked(): Promise<never> {
    return Promise.reject(new MapProviderError("CONFIGURATION_BLOCKED", false));
  }

  search(): Promise<never> {
    return this.blocked();
  }

  reverse(): Promise<never> {
    return this.blocked();
  }

  route(): Promise<never> {
    return this.blocked();
  }

  matrix(): Promise<never> {
    return this.blocked();
  }
}
