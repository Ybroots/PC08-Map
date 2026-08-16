import { ProviderQuality } from "@atgt/contracts";
import type {
  AddressResult,
  MapProviderPort,
  MatrixInput,
  MatrixResult,
  ProviderContext,
  ProviderMetadata,
  ReverseInput,
  RouteInput,
  RouteResult,
  SearchInput,
  SearchResult,
} from "./map-provider.port";
import { MapProviderError } from "./provider-error";

export interface FakeMapAdapterOptions {
  now?: () => Date;
}

/** Deterministic test/local adapter. It never makes a network request. */
export class FakeMapAdapter implements MapProviderPort {
  simulateFailure = false;
  simulateLatencyMs = 0;
  private callCount = 0;
  private readonly now: () => Date;

  constructor(options: FakeMapAdapterOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
    this.simulateFailure = false;
    this.simulateLatencyMs = 0;
  }

  private metadata(): ProviderMetadata {
    return {
      provider: "fake",
      apiVersion: "fake-v1",
      quality: ProviderQuality.LIVE,
      observedAt: this.now().toISOString(),
      cacheStatus: "BYPASS",
      latencyMs: this.simulateLatencyMs,
    };
  }

  private async beforeCall(): Promise<void> {
    this.callCount += 1;
    if (this.simulateLatencyMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.simulateLatencyMs),
      );
    }
    if (this.simulateFailure) {
      throw new MapProviderError("UPSTREAM_UNAVAILABLE", false);
    }
  }

  async search(
    input: SearchInput,
    _ctx: ProviderContext,
  ): Promise<SearchResult[]> {
    await this.beforeCall();
    return [
      {
        displayName: `Fake result for: ${input.query}`,
        longitude: 108.4384,
        latitude: 11.9404,
        ...this.metadata(),
      },
    ];
  }

  async reverse(
    _input: ReverseInput,
    _ctx: ProviderContext,
  ): Promise<AddressResult> {
    await this.beforeCall();
    return {
      displayAddress: "01 Tran Phu, Da Lat, Lam Dong",
      ...this.metadata(),
    };
  }

  async route(_input: RouteInput, _ctx: ProviderContext): Promise<RouteResult> {
    await this.beforeCall();
    return {
      distanceMeters: 5000,
      durationSeconds: 600,
      isDegraded: false,
      ...this.metadata(),
    };
  }

  async matrix(
    input: MatrixInput,
    _ctx: ProviderContext,
  ): Promise<MatrixResult> {
    await this.beforeCall();
    return {
      durations: input.origins.map((_origin, originIndex) =>
        input.destinations.map(
          (_destination, destinationIndex) =>
            300 + originIndex * 60 + destinationIndex * 30,
        ),
      ),
      isDegraded: false,
      ...this.metadata(),
    };
  }
}
