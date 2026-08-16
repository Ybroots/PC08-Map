import { ProviderQuality } from "@atgt/contracts";
import {
  MapProviderPort,
  ProviderContext,
  SearchInput,
  SearchResult,
  ReverseInput,
  AddressResult,
  RouteInput,
  RouteResult,
  MatrixInput,
  MatrixResult,
} from "./map-provider.port";

/**
 * FakeMapAdapter - Test double for MapProviderPort
 *
 * Use this in ALL unit and integration tests.
 * Never use real VietMap in test suite.
 * Configure behavior via simulateFailure / simulateLatencyMs.
 */
export class FakeMapAdapter implements MapProviderPort {
  simulateFailure = false;
  simulateLatencyMs = 0;
  private callCount = 0;

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
    this.simulateFailure = false;
    this.simulateLatencyMs = 0;
  }

  private async maybeDelay(): Promise<void> {
    if (this.simulateLatencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulateLatencyMs));
    }
  }

  private checkFailure(): void {
    if (this.simulateFailure) {
      throw new Error("FakeMapAdapter: simulated provider failure");
    }
  }

  async search(
    input: SearchInput,
    _ctx: ProviderContext,
  ): Promise<SearchResult[]> {
    await this.maybeDelay();
    this.checkFailure();
    this.callCount++;
    return [
      {
        displayName: `Fake result for: ${input.query}`,
        longitude: 108.4384,
        latitude: 11.9404,
        quality: ProviderQuality.LIVE,
        observedAt: new Date().toISOString(),
      },
    ];
  }

  async reverse(
    _input: ReverseInput,
    _ctx: ProviderContext,
  ): Promise<AddressResult> {
    await this.maybeDelay();
    this.checkFailure();
    this.callCount++;
    return {
      displayAddress: "01 Tran Phu, Da Lat, Lam Dong",
      quality: ProviderQuality.LIVE,
      observedAt: new Date().toISOString(),
    };
  }

  async route(_input: RouteInput, _ctx: ProviderContext): Promise<RouteResult> {
    await this.maybeDelay();
    this.checkFailure();
    this.callCount++;
    return {
      distanceMeters: 5000,
      durationSeconds: 600,
      quality: ProviderQuality.LIVE,
      observedAt: new Date().toISOString(),
      isDegraded: false,
    };
  }

  async matrix(
    input: MatrixInput,
    _ctx: ProviderContext,
  ): Promise<MatrixResult> {
    await this.maybeDelay();
    this.checkFailure();
    this.callCount++;
    const n = input.origins.length;
    const m = input.destinations.length;
    return {
      durations: Array.from({ length: n }, () =>
        Array.from({ length: m }, () => 300 + Math.random() * 300),
      ),
      quality: ProviderQuality.LIVE,
      observedAt: new Date().toISOString(),
      isDegraded: false,
    };
  }
}
