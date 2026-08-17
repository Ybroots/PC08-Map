const getCurrentPosition = jest.fn();
const requestAuthorization = jest.fn();

jest.mock("@react-native-community/geolocation", () => ({
  __esModule: true,
  default: { getCurrentPosition, requestAuthorization },
}));

import { PermissionsAndroid, Platform } from "react-native";
import { NativeLocationPort } from "./location";

const requestMultiple = jest.spyOn(PermissionsAndroid, "requestMultiple");
const checkPermission = jest.spyOn(PermissionsAndroid, "check");

describe("NativeLocationPort Android permissions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = "android";
    checkPermission.mockResolvedValue(false);
    getCurrentPosition.mockImplementation((success) =>
      success({
        coords: { longitude: 108.4384, latitude: 11.9404, accuracy: 250 },
        timestamp: Date.parse("2026-08-17T04:00:00.000Z"),
      }),
    );
  });

  it.each([
    ["precise", "granted", "granted", true],
    ["approximate", "denied", "granted", false],
  ])(
    "accepts %s permission and sets high accuracy to %s",
    async (_name, fine, coarse, highAccuracy) => {
      requestMultiple.mockResolvedValue({
        [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: fine,
        [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: coarse,
      } as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);

      await expect(
        new NativeLocationPort().getCurrentFix(),
      ).resolves.toMatchObject({ accuracyMeters: 250 });
      expect(getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({ enableHighAccuracy: highAccuracy }),
      );
    },
  );

  it("fails closed when neither Android location permission is granted", async () => {
    requestMultiple.mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: "denied",
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: "denied",
    } as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);

    await expect(
      new NativeLocationPort().getCurrentFix(),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("reuses an existing approximate grant without prompting for precise", async () => {
    checkPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(
      new NativeLocationPort().getCurrentFix(),
    ).resolves.toMatchObject({
      accuracyMeters: 250,
    });
    expect(requestMultiple).not.toHaveBeenCalled();
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: false }),
    );
  });
});
