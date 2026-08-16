/**
 * GeoPoint - Immutable geographic coordinate value object
 *
 * RULES (from ADR-009):
 * - Coordinate order: [longitude, latitude] (GeoJSON standard)
 * - CRS: EPSG:4326 only at domain boundary
 * - longitude: -180 to 180
 * - latitude:  -90 to 90
 * - accuracyMeters: optional GPS accuracy in meters
 *
 * This class has NO framework, ORM, HTTP or environment dependencies.
 */
export class GeoPoint {
  readonly longitude: number;
  readonly latitude: number;
  readonly accuracyMeters?: number;

  private constructor(
    longitude: number,
    latitude: number,
    accuracyMeters?: number,
  ) {
    this.longitude = longitude;
    this.latitude = latitude;
    this.accuracyMeters = accuracyMeters;
  }

  static create(
    longitude: number,
    latitude: number,
    accuracyMeters?: number,
  ): GeoPoint {
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error(
        `Invalid longitude: ${longitude}. Must be between -180 and 180.`,
      );
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error(
        `Invalid latitude: ${latitude}. Must be between -90 and 90.`,
      );
    }
    if (
      accuracyMeters !== undefined &&
      (!Number.isFinite(accuracyMeters) || accuracyMeters < 0)
    ) {
      throw new Error(
        `accuracyMeters must be non-negative, got ${accuracyMeters}`,
      );
    }
    return new GeoPoint(longitude, latitude, accuracyMeters);
  }

  /** Returns GeoJSON-compliant [longitude, latitude] tuple */
  toGeoJsonCoordinates(): [number, number] {
    return [this.longitude, this.latitude];
  }

  /** Returns PostGIS-compatible WKT point string */
  toWKT(): string {
    return `POINT(${this.longitude} ${this.latitude})`;
  }

  equals(other: GeoPoint): boolean {
    return (
      this.longitude === other.longitude && this.latitude === other.latitude
    );
  }

  hasGoodAccuracy(thresholdMeters = 50): boolean {
    if (this.accuracyMeters === undefined) return false;
    return this.accuracyMeters <= thresholdMeters;
  }
}
