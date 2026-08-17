import {
  DEVELOPMENT_NATIVE_APPLICATION_ID,
  resolveNativeSosBootstrapConfig,
} from "./native-config";

describe("native SOS bootstrap config", () => {
  it("uses an explicitly development-only application identifier", () => {
    expect(DEVELOPMENT_NATIVE_APPLICATION_ID).toBe("com.atgtlamdong.dev");
  });

  it.each([
    ["android", "http://10.0.2.2:3000"],
    ["ios", "http://localhost:3000"],
  ])(
    "resolves the %s emulator endpoint only in development",
    (platform, expected) => {
      expect(resolveNativeSosBootstrapConfig(true, platform)).toMatchObject({
        apiBaseUrl: expected,
      });
    },
  );

  it("keeps release and unsupported platforms configuration-blocked", () => {
    expect(resolveNativeSosBootstrapConfig(false, "android")).toBeUndefined();
    expect(resolveNativeSosBootstrapConfig(true, "windows")).toBeUndefined();
  });
});
