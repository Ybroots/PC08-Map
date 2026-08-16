import { DynamicModule, Module } from "@nestjs/common";
import type { AppConfig } from "@atgt/config";
import {
  ConfigurationBlockedMapAdapter,
  FakeMapAdapter,
  MAP_PROVIDER_PORT,
  type MapProviderPort,
  type MapResilienceOptions,
  ResilientMapAdapter,
} from "@atgt/vietmap-client";

/**
 * Synthetic-only resilience values. They cannot be reused for a real VietMap
 * integration; D-03 must supply approved cache/licensing and API limits first.
 */
const LOCAL_FAKE_OPTIONS: MapResilienceOptions = {
  search: {
    cacheTtlMs: 1_000,
    maxStaleMs: 3_000,
    failureThreshold: 2,
    resetTimeoutMs: 1_000,
    maxAttempts: 1,
    retryBaseDelayMs: 1,
  },
  reverse: {
    cacheTtlMs: 1_000,
    maxStaleMs: 3_000,
    failureThreshold: 2,
    resetTimeoutMs: 1_000,
    maxAttempts: 1,
    retryBaseDelayMs: 1,
  },
  route: {
    cacheTtlMs: 1_000,
    maxStaleMs: 3_000,
    failureThreshold: 2,
    resetTimeoutMs: 1_000,
    maxAttempts: 1,
    retryBaseDelayMs: 1,
  },
  matrix: {
    cacheTtlMs: 1_000,
    maxStaleMs: 3_000,
    failureThreshold: 2,
    resetTimeoutMs: 1_000,
    maxAttempts: 1,
    retryBaseDelayMs: 1,
  },
};

export function createMapProvider(
  config: AppConfig["vietmap"],
): MapProviderPort {
  if (!config.useFakeAdapter) {
    return new ConfigurationBlockedMapAdapter();
  }

  return new ResilientMapAdapter(new FakeMapAdapter(), {
    apis: LOCAL_FAKE_OPTIONS,
  });
}

@Module({})
export class MapProviderModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: MapProviderModule,
      providers: [
        {
          provide: MAP_PROVIDER_PORT,
          useFactory: (): MapProviderPort => createMapProvider(config.vietmap),
        },
      ],
      exports: [MAP_PROVIDER_PORT],
    };
  }
}
