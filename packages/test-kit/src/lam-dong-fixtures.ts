import { GeoPoint } from "@atgt/domain";

/**
 * LamDongFixtures - Geographic test fixtures for Lam Dong province
 *
 * All coordinates are approximate public reference points.
 * NEVER use real personal data or actual incident locations.
 */
export const LAM_DONG_FIXTURES = {
  /** Da Lat city center */
  DA_LAT_CENTER: GeoPoint.create(108.4384, 11.9404),
  /** Da Lat Police HQ (approximate) */
  DA_LAT_POLICE: GeoPoint.create(108.438, 11.943),
  /** Bao Loc city */
  BAO_LOC: GeoPoint.create(107.8073, 11.5462),
  /** Di Linh */
  DI_LINH: GeoPoint.create(108.0717, 11.5757),
  /** Duc Trong */
  DUC_TRONG: GeoPoint.create(108.294, 11.7605),
  /** Outside Lam Dong (HCMC - for cross-area tests) */
  OUTSIDE_PROVINCE: GeoPoint.create(106.6297, 10.8231),
} as const;

/** Sample incident types for tests */
export const SAMPLE_INCIDENT_TYPES = [
  "TRAFFIC_ACCIDENT",
  "CNCH",
  "TRAFFIC_CONGESTION",
  "ROAD_HAZARD",
] as const;

export type SampleIncidentType = (typeof SAMPLE_INCIDENT_TYPES)[number];
