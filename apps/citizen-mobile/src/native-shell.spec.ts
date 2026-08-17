import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEVELOPMENT_NATIVE_APPLICATION_ID } from "./native-config";

const readMobileFile = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("native shell security boundary", () => {
  test("keeps the development identifier aligned without a committed signing key", () => {
    const androidBuild = readMobileFile("android/app/build.gradle");
    const iosProject = readMobileFile(
      "ios/ATGTLamDong.xcodeproj/project.pbxproj",
    );

    expect(androidBuild).toContain(
      `applicationId "${DEVELOPMENT_NATIVE_APPLICATION_ID}"`,
    );
    expect(androidBuild).toContain(
      `namespace "${DEVELOPMENT_NATIVE_APPLICATION_ID}"`,
    );
    expect(androidBuild).not.toContain("signingConfig");
    expect(iosProject).toContain(
      `PRODUCT_BUNDLE_IDENTIFIER = "${DEVELOPMENT_NATIVE_APPLICATION_ID}"`,
    );
    expect(existsSync(join(process.cwd(), "android/app/debug.keystore"))).toBe(
      false,
    );
  });

  test("limits cleartext networking to Android debug", () => {
    const mainManifest = readMobileFile(
      "android/app/src/main/AndroidManifest.xml",
    );
    const debugManifest = readMobileFile(
      "android/app/src/debug/AndroidManifest.xml",
    );

    expect(mainManifest).toContain("android.permission.ACCESS_COARSE_LOCATION");
    expect(mainManifest).toContain("android.permission.ACCESS_FINE_LOCATION");
    expect(mainManifest).toContain('android:allowBackup="false"');
    expect(mainManifest).not.toContain("usesCleartextTraffic");
    expect(debugManifest).toContain('android:usesCleartextTraffic="true"');
  });

  test("declares iOS location purpose without arbitrary network loads", () => {
    const infoPlist = readMobileFile("ios/ATGTLamDong/Info.plist");

    expect(infoPlist).toContain("NSLocationWhenInUseUsageDescription");
    expect(infoPlist).toContain("NSAllowsArbitraryLoads");
    expect(infoPlist).toContain("<false/>");
    expect(infoPlist).not.toContain(
      "<key>NSAllowsArbitraryLoads</key>\n\t\t<true/>",
    );
  });
});
