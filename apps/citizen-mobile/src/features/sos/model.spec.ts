import {
  assessLocationQuality,
  toCreateSosDto,
  type LocationFix,
} from "./model";

const FIX: LocationFix = {
  coordinateLongitude: 108.4384,
  coordinateLatitude: 11.9404,
  accuracyMeters: 125,
  capturedAt: "2026-08-17T04:00:00.000Z",
};

describe("mobile SOS model", () => {
  it("maps longitude/latitude and captured time to the T07 contract", () => {
    expect(
      toCreateSosDto({
        fix: FIX,
        incidentType: "TRAFFIC_ACCIDENT",
        description: "  Va chạm hai xe  ",
      }),
    ).toEqual({
      coordinateLongitude: 108.4384,
      coordinateLatitude: 11.9404,
      accuracyMeters: 125,
      incidentType: "TRAFFIC_ACCIDENT",
      description: "Va chạm hai xe",
      clientEventAt: "2026-08-17T04:00:00.000Z",
    });
  });

  it("warns for stale and low-accuracy fixes without rejecting them", () => {
    expect(
      assessLocationQuality(FIX, new Date("2026-08-17T04:01:00.000Z"), {
        staleAfterMs: 30_000,
        lowAccuracyAboveMeters: 100,
      }),
    ).toEqual({ ageMs: 60_000, isStale: true, isLowAccuracy: true });
  });

  it("does not make a future device timestamp negative", () => {
    expect(
      assessLocationQuality(FIX, new Date("2026-08-17T03:59:00.000Z"), {
        staleAfterMs: 30_000,
        lowAccuracyAboveMeters: 200,
      }),
    ).toEqual({ ageMs: 0, isStale: false, isLowAccuracy: false });
  });
});
