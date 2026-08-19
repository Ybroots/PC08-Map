import type { Pool } from "pg";
import {
  PostgresTrafficAlertRepository,
  TrafficAlertFailure,
} from "./traffic-alert.repository";

const query = {
  bbox: [108.4, 11.9, 108.5, 11.98] as [number, number, number, number],
  vehicle_type: "MOTORCYCLE" as const,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    layer_key: "dangerous_points",
    version_number: 2,
    feature_key: "danger-test",
    geometry: { type: "Point", coordinates: [108.4384, 11.9404] },
    alert_properties: {
      priority: "WARNING",
      warning_vi: "Điểm nguy hiểm (FAKE)",
      action_vi: "Giảm tốc độ (FAKE)",
      vehicle_types: ["ALL"],
    },
    version_valid_from: new Date("2026-01-01T00:00:00Z"),
    version_valid_to: null,
    feature_valid_from: new Date("2026-02-01T00:00:00Z"),
    feature_valid_to: new Date("2027-01-01T00:00:00Z"),
    ...overrides,
  };
}

function fixture(rows: unknown[], maxCandidates = 10, maxResults = 10) {
  const pool = {
    query: jest.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
  return {
    pool,
    repository: new PostgresTrafficAlertRepository(pool, {
      enabled: true,
      maxCandidates,
      maxResults,
    }),
  };
}

describe("PostgresTrafficAlertRepository", () => {
  it("fails before querying when the bbox-only projection is disabled", async () => {
    const pool = { query: jest.fn() } as unknown as Pool;
    const alerts = new PostgresTrafficAlertRepository(pool, { enabled: false });
    await expect(alerts.list(query)).rejects.toEqual(
      new TrafficAlertFailure("CONFIGURATION_BLOCKED"),
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns only the requested vehicle and sanitizes source properties", async () => {
    const { repository } = fixture([
      row({
        feature_key: "car-only",
        alert_properties: {
          priority: "CRITICAL",
          warning_vi: "Chỉ ô tô (FAKE)",
          action_vi: "Đi tuyến khác (FAKE)",
          vehicle_types: ["CAR"],
        },
      }),
      row(),
    ]);
    const result = await repository.list(query);
    expect(result).toMatchObject({
      source: "PUBLISHED_MAP_DATA",
      quality: "PUBLISHED",
      capability: "BBOX_ONLY",
    });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({
      alert_id: "dangerous_points:danger-test",
      source_version: 2,
      valid_from: "2026-02-01T00:00:00.000Z",
      valid_to: "2027-01-01T00:00:00.000Z",
    });
    expect(result.alerts[0]).not.toHaveProperty("name");
  });

  it("fails closed for a malformed published source", async () => {
    const { repository } = fixture([
      row({ alert_properties: { warning_vi: "missing fields" } }),
    ]);
    await expect(repository.list(query)).rejects.toMatchObject({
      code: "SOURCE_INVALID",
    });
  });

  it("rejects candidate and result overflow instead of truncating", async () => {
    const candidates = fixture(
      [row(), row({ feature_key: "second" }), row({ feature_key: "third" })],
      2,
      2,
    ).repository;
    await expect(candidates.list(query)).rejects.toMatchObject({
      code: "QUERY_TOO_BROAD",
    });

    const results = fixture(
      [row(), row({ feature_key: "second" })],
      3,
      1,
    ).repository;
    await expect(results.list(query)).rejects.toMatchObject({
      code: "QUERY_TOO_BROAD",
    });
  });
});
