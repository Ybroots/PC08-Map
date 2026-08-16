import type { MapProviderApi, ProviderCacheStatus } from "./map-provider.port";
import type { MapProviderErrorCode } from "./provider-error";

export interface ProviderCallObservation {
  api: MapProviderApi;
  latencyMs: number;
  cacheStatus: ProviderCacheStatus;
  outcome: "success" | "degraded" | "failure";
  errorCode?: MapProviderErrorCode;
}

export interface ProviderQuotaAlert {
  api: MapProviderApi;
  environment: string;
  keyAlias: string;
  periodId: string;
  used: number;
  limit: number;
  percent: number;
  thresholdPercent: number;
}

export interface MapProviderTelemetry {
  recordCall(observation: ProviderCallObservation): void;
  recordQuotaAlert(alert: ProviderQuotaAlert): void;
}

export class NoopMapProviderTelemetry implements MapProviderTelemetry {
  recordCall(_observation: ProviderCallObservation): void {}
  recordQuotaAlert(_alert: ProviderQuotaAlert): void {}
}

/**
 * Quota limits come from the approved provider contract. This tracker accepts
 * them as runtime observations and never invents or persists a quota.
 */
export class ProviderQuotaTracker {
  private readonly emitted = new Set<string>();

  constructor(
    private readonly telemetry: MapProviderTelemetry,
    private readonly thresholdsPercent: readonly number[],
  ) {
    if (
      thresholdsPercent.length === 0 ||
      thresholdsPercent.some(
        (threshold) =>
          !Number.isInteger(threshold) || threshold < 1 || threshold > 100,
      )
    ) {
      throw new Error("Quota thresholds must be integers between 1 and 100");
    }
  }

  observe(input: {
    api: MapProviderApi;
    environment: string;
    keyAlias: string;
    /** Provider-defined quota window identity; for example a billing period. */
    periodId: string;
    used: number;
    limit: number;
  }): void {
    if (
      input.periodId.trim().length === 0 ||
      input.used < 0 ||
      input.limit <= 0
    ) {
      throw new Error(
        "Quota period, usage and limit must be valid provider values",
      );
    }

    const percent = (input.used / input.limit) * 100;
    for (const thresholdPercent of [...this.thresholdsPercent].sort(
      (left, right) => left - right,
    )) {
      const identity = `${input.environment}:${input.keyAlias}:${input.api}:${input.periodId}:${thresholdPercent}`;
      if (percent >= thresholdPercent && !this.emitted.has(identity)) {
        this.emitted.add(identity);
        this.telemetry.recordQuotaAlert({
          ...input,
          percent,
          thresholdPercent,
        });
      }
    }
  }
}
