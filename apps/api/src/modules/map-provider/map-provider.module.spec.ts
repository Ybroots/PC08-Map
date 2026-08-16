import { ProviderQuality } from "@atgt/contracts";
import { createMapProvider } from "./map-provider.module";

const baseConfig = {
  baseUrl: "https://maps.vietmap.vn",
  serverKeyRef: "secret:vietmap/server-key",
  clientKeyAlias: "vm-client-test",
  timeoutMs: 100,
  quotaWarningPct: 70,
  useFakeAdapter: true,
};

describe("createMapProvider", () => {
  it("uses a deterministic fake provider when the feature flag is enabled", async () => {
    const provider = createMapProvider(baseConfig);

    const result = await provider.route(
      { origin: [108.43, 11.94], destination: [108.45, 11.95] },
      { traceId: "trace-test", timeoutMs: 100 },
    );

    expect(result.provider).toBe("fake");
    expect(result.quality).toBe(ProviderQuality.LIVE);
  });

  it("keeps core boot available but fails real calls closed while D-03 is pending", async () => {
    const provider = createMapProvider({
      ...baseConfig,
      useFakeAdapter: false,
    });

    await expect(
      provider.search(
        { query: "Da Lat" },
        { traceId: "trace-test", timeoutMs: 100 },
      ),
    ).rejects.toMatchObject({
      code: "CONFIGURATION_BLOCKED",
    });
  });
});
