import { GeoPoint } from "./geo-point";

describe("GeoPoint", () => {
  describe("create", () => {
    it("creates valid point with Da Lat coordinates", () => {
      const point = GeoPoint.create(108.4384, 11.9404);
      expect(point.longitude).toBe(108.4384);
      expect(point.latitude).toBe(11.9404);
    });

    it("creates point with accuracy", () => {
      const point = GeoPoint.create(108.4384, 11.9404, 25);
      expect(point.accuracyMeters).toBe(25);
    });

    it("throws on invalid longitude > 180", () => {
      expect(() => GeoPoint.create(181, 11.9)).toThrow("longitude");
    });

    it("throws on invalid longitude < -180", () => {
      expect(() => GeoPoint.create(-181, 11.9)).toThrow("longitude");
    });

    it("throws on invalid latitude > 90", () => {
      expect(() => GeoPoint.create(108.4, 91)).toThrow("latitude");
    });

    it("throws on invalid latitude < -90", () => {
      expect(() => GeoPoint.create(108.4, -91)).toThrow("latitude");
    });

    it("throws on negative accuracyMeters", () => {
      expect(() => GeoPoint.create(108.4, 11.9, -1)).toThrow("accuracyMeters");
    });

    it.each([
      [Number.NaN, 11.9, undefined],
      [Number.POSITIVE_INFINITY, 11.9, undefined],
      [108.4, Number.NaN, undefined],
      [108.4, 11.9, Number.POSITIVE_INFINITY],
    ])(
      "rejects non-finite coordinates and accuracy",
      (longitude, latitude, accuracy) => {
        expect(() => GeoPoint.create(longitude, latitude, accuracy)).toThrow();
      },
    );
  });

  describe("toGeoJsonCoordinates", () => {
    it("returns [longitude, latitude] order (GeoJSON standard)", () => {
      const point = GeoPoint.create(108.4384, 11.9404);
      const coords = point.toGeoJsonCoordinates();
      expect(coords[0]).toBe(108.4384); // longitude first
      expect(coords[1]).toBe(11.9404); // latitude second
    });
  });

  describe("toWKT", () => {
    it("returns PostGIS-compatible WKT", () => {
      const point = GeoPoint.create(108.4384, 11.9404);
      expect(point.toWKT()).toBe("POINT(108.4384 11.9404)");
    });
  });

  describe("hasGoodAccuracy", () => {
    it("returns true when accuracy is within threshold", () => {
      const point = GeoPoint.create(108.4384, 11.9404, 30);
      expect(point.hasGoodAccuracy(50)).toBe(true);
    });

    it("returns false when accuracy exceeds threshold", () => {
      const point = GeoPoint.create(108.4384, 11.9404, 100);
      expect(point.hasGoodAccuracy(50)).toBe(false);
    });

    it("returns false when accuracy is unknown", () => {
      const point = GeoPoint.create(108.4384, 11.9404);
      expect(point.hasGoodAccuracy()).toBe(false);
    });
  });
});
