import type { AppConfig } from "@atgt/config";
import {
  TrafficAlertSourcePropertiesSchema,
  type TrafficAlertCollection,
  type TrafficAlertQuery,
} from "@atgt/contracts";
import type { Pool } from "pg";

const ALERT_LAYER_KEYS = [
  "dangerous_points",
  "road_closures",
  "no_parking",
  "temp_events",
] as const;

interface AlertRow {
  layer_key: (typeof ALERT_LAYER_KEYS)[number];
  version_number: number;
  feature_key: string;
  geometry: TrafficAlertCollection["alerts"][number]["geometry"];
  alert_properties: unknown;
  version_valid_from: Date;
  version_valid_to: Date | null;
  feature_valid_from: Date;
  feature_valid_to: Date | null;
}

export type TrafficAlertFailureCode =
  "CONFIGURATION_BLOCKED" | "QUERY_TOO_BROAD" | "SOURCE_INVALID";

export class TrafficAlertFailure extends Error {
  constructor(readonly code: TrafficAlertFailureCode) {
    super(code);
    this.name = "TrafficAlertFailure";
  }
}

export class PostgresTrafficAlertRepository {
  constructor(
    private readonly pool: Pool,
    private readonly config: AppConfig["trafficAlerts"],
  ) {}

  async list(query: TrafficAlertQuery): Promise<TrafficAlertCollection> {
    if (
      !this.config.enabled ||
      this.config.maxCandidates === undefined ||
      this.config.maxResults === undefined
    ) {
      throw new TrafficAlertFailure("CONFIGURATION_BLOCKED");
    }
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const effectiveAt = new Date();
    const candidates = await this.pool.query<AlertRow>(
      `WITH current_versions AS (
         SELECT DISTINCT ON (v.layer_id)
                v.layer_id,v.version_id,v.version_number,v.valid_from,v.valid_to,
                l.layer_key
           FROM map.layer_versions v
           JOIN map.layers l ON l.layer_id=v.layer_id
          WHERE l.layer_key=ANY($1::text[]) AND l.is_public=true
            AND v.data_class='public' AND v.state='PUBLISHED'
            AND v.valid_from<=$2 AND (v.valid_to IS NULL OR v.valid_to>$2)
          ORDER BY v.layer_id,v.version_number DESC
       )
       SELECT cv.layer_key,cv.version_number,f.feature_key,
              ST_AsGeoJSON(f.geom)::jsonb AS geometry,
              f.properties->'alert' AS alert_properties,
              cv.valid_from AS version_valid_from,
              cv.valid_to AS version_valid_to,
              f.valid_from AS feature_valid_from,
              f.valid_to AS feature_valid_to
         FROM current_versions cv
         JOIN map.features f ON f.version_id=cv.version_id
        WHERE f.publish_state='PUBLISHED'
          AND f.valid_from<=$2 AND (f.valid_to IS NULL OR f.valid_to>$2)
          AND f.geom && ST_MakeEnvelope($3,$4,$5,$6,4326)
        ORDER BY cv.layer_key,f.feature_key
        LIMIT $7`,
      [
        ALERT_LAYER_KEYS,
        effectiveAt,
        minLon,
        minLat,
        maxLon,
        maxLat,
        this.config.maxCandidates + 1,
      ],
    );
    if (candidates.rows.length > this.config.maxCandidates) {
      throw new TrafficAlertFailure("QUERY_TOO_BROAD");
    }

    const alerts: TrafficAlertCollection["alerts"] = [];
    for (const row of candidates.rows) {
      const properties = TrafficAlertSourcePropertiesSchema.safeParse(
        row.alert_properties,
      );
      if (!properties.success) {
        throw new TrafficAlertFailure("SOURCE_INVALID");
      }
      if (
        !properties.data.vehicle_types.includes("ALL") &&
        !properties.data.vehicle_types.includes(query.vehicle_type)
      ) {
        continue;
      }
      const validFrom = new Date(
        Math.max(
          row.version_valid_from.getTime(),
          row.feature_valid_from.getTime(),
        ),
      );
      const validToCandidates = [
        row.version_valid_to?.getTime(),
        row.feature_valid_to?.getTime(),
      ].filter((value): value is number => value !== undefined);
      alerts.push({
        alert_id: `${row.layer_key}:${row.feature_key}`,
        layer_key: row.layer_key,
        feature_key: row.feature_key,
        source_version: row.version_number,
        geometry: row.geometry,
        ...properties.data,
        valid_from: validFrom.toISOString(),
        valid_to:
          validToCandidates.length > 0
            ? new Date(Math.min(...validToCandidates)).toISOString()
            : null,
      });
    }
    if (alerts.length > this.config.maxResults) {
      throw new TrafficAlertFailure("QUERY_TOO_BROAD");
    }
    const priority = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
    alerts.sort(
      (left, right) =>
        priority[left.priority] - priority[right.priority] ||
        left.alert_id.localeCompare(right.alert_id),
    );
    return {
      effective_at: effectiveAt.toISOString(),
      source: "PUBLISHED_MAP_DATA",
      quality: "PUBLISHED",
      capability: "BBOX_ONLY",
      alerts,
    };
  }
}
