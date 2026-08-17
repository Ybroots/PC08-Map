import Geolocation from "@react-native-community/geolocation";
import { PermissionsAndroid, Platform } from "react-native";
import { LocationUnavailableError, type LocationFix } from "./model";
import type { LocationPort } from "./ports";

export interface NativeLocationOptions {
  readonly requestTimeoutMs: number;
  readonly maximumAgeMs: number;
}

export const DEFAULT_NATIVE_LOCATION_OPTIONS: NativeLocationOptions = {
  requestTimeoutMs: 15_000,
  maximumAgeMs: 30_000,
};

export class NativeLocationPort implements LocationPort {
  constructor(
    private readonly options: NativeLocationOptions = DEFAULT_NATIVE_LOCATION_OPTIONS,
  ) {}

  async getCurrentFix(): Promise<LocationFix> {
    const permission = await requestLocationPermission();
    if (!permission) {
      throw new LocationUnavailableError("PERMISSION_DENIED");
    }
    return new Promise<LocationFix>((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position) => {
          resolve({
            coordinateLongitude: position.coords.longitude,
            coordinateLatitude: position.coords.latitude,
            accuracyMeters: position.coords.accuracy,
            capturedAt: new Date(position.timestamp).toISOString(),
          });
        },
        () => reject(new LocationUnavailableError("POSITION_UNAVAILABLE")),
        {
          enableHighAccuracy: permission === "precise",
          timeout: this.options.requestTimeoutMs,
          maximumAge: this.options.maximumAgeMs,
        },
      );
    });
  }
}

type LocationPermission = "precise" | "approximate";

async function requestLocationPermission(): Promise<
  LocationPermission | undefined
> {
  if (Platform.OS === "android") {
    const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
    if (await PermissionsAndroid.check(fine)) return "precise";
    if (await PermissionsAndroid.check(coarse)) return "approximate";
    const results = await PermissionsAndroid.requestMultiple([fine, coarse]);
    if (results[fine] === PermissionsAndroid.RESULTS.GRANTED) return "precise";
    if (results[coarse] === PermissionsAndroid.RESULTS.GRANTED)
      return "approximate";
    return undefined;
  }
  if (Platform.OS === "ios") {
    return new Promise<LocationPermission | undefined>((resolve) => {
      Geolocation.requestAuthorization(
        () => resolve("precise"),
        () => resolve(undefined),
      );
    });
  }
  return undefined;
}
