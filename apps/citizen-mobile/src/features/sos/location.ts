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
    const permitted = await requestLocationPermission();
    if (!permitted) {
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
          enableHighAccuracy: true,
          timeout: this.options.requestTimeoutMs,
          maximumAge: this.options.maximumAgeMs,
        },
      );
    });
  }
}

async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  if (Platform.OS === "ios") {
    return new Promise<boolean>((resolve) => {
      Geolocation.requestAuthorization(
        () => resolve(true),
        () => resolve(false),
      );
    });
  }
  return false;
}
