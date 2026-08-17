import { randomUUID } from "node:crypto";
import {
  AuthorizationPolicy,
  DataClass,
  PolicyAction,
  requireAccessScope,
  type AccessScope,
} from "@atgt/authorization";
import {
  EVENT_ROUTING_KEYS,
  MapFeatureCollectionInputSchema,
  type CreateMapVersion,
  type MapFeatureInput,
  type MapVersion,
  type PublicMapQuery,
} from "@atgt/contracts";
import {
  approveMapVersion,
  publishMapVersion,
  submitMapVersion,
  withdrawMapVersion,
  type MapVersionSnapshot,
} from "@atgt/domain";
import { createTraceId } from "@atgt/observability";
import type { Pool, PoolClient } from "pg";
import {
  PostgresOutboxWriter,
  PostgresTransactionManager,
} from "../../platform/database";

type GeometryType = "POINT" | "LINE" | "POLYGON";

interface LayerSchemaRow {
  layer_id: string;
  layer_key: string;
  layer_type: GeometryType;
  schema_version: number;
  schema_json: JsonSchema;
}

interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<
    string,
    { type?: string; enum?: unknown[]; minimum?: number }
  >;
  additionalProperties?: boolean;
}

interface VersionRow {
  version_id: string;
  layer_id: string;
  layer_key: string;
  version_number: number;
  area_id: string;
  data_class: "public" | "internal" | "sensitive" | "restricted";
  state: MapVersion["state"];
  valid_from: Date;
  valid_to: Date | null;
  created_by: string;
  submitted_by: string | null;
}

export type MapDataFailureCode =
  | "NOT_FOUND"
  | "INVALID_GEOMETRY"
  | "INVALID_STATE"
  | "MAKER_CHECKER"
  | "INVALID_SCHEMA"
  | "FORBIDDEN";

export class MapDataFailure extends Error {
  constructor(
    readonly code: MapDataFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "MapDataFailure";
  }
}

function geometryName(feature: MapFeatureInput): GeometryType {
  return feature.geometry.type === "LineString"
    ? "LINE"
    : (feature.geometry.type.toUpperCase() as GeometryType);
}

function validateProperties(
  schema: JsonSchema,
  value: Record<string, unknown>,
): string[] {
  const issues: string[] = [];
  for (const required of schema.required ?? []) {
    if (!(required in value))
      issues.push(`Missing required property: ${required}`);
  }
  for (const [key, propertyValue] of Object.entries(value)) {
    const rule = schema.properties?.[key];
    if (!rule) {
      if (schema.additionalProperties === false)
        issues.push(`Unknown property: ${key}`);
      continue;
    }
    if (rule.type === "string" && typeof propertyValue !== "string")
      issues.push(`${key} must be a string`);
    if (rule.type === "integer" && !Number.isInteger(propertyValue))
      issues.push(`${key} must be an integer`);
    if (rule.type === "number" && typeof propertyValue !== "number")
      issues.push(`${key} must be a number`);
    if (rule.type === "boolean" && typeof propertyValue !== "boolean")
      issues.push(`${key} must be a boolean`);
    if (
      rule.enum &&
      !rule.enum.some((candidate) => Object.is(candidate, propertyValue))
    )
      issues.push(`${key} is outside the approved enum`);
    if (
      rule.minimum !== undefined &&
      typeof propertyValue === "number" &&
      propertyValue < rule.minimum
    )
      issues.push(`${key} is below the minimum`);
  }
  return issues;
}

function snapshot(row: VersionRow): MapVersionSnapshot {
  return {
    state: row.state,
    createdBy: row.created_by,
    submittedBy: row.submitted_by ?? undefined,
    validFrom: row.valid_from,
    validTo: row.valid_to ?? undefined,
  };
}

function contract(
  row: VersionRow & { change_summary: MapVersion["change_summary"] },
): MapVersion {
  return {
    version_id: row.version_id,
    layer_id: row.layer_id,
    version_number: row.version_number,
    area_id: row.area_id,
    data_class: row.data_class,
    state: row.state,
    valid_from: row.valid_from.toISOString(),
    valid_to: row.valid_to?.toISOString() ?? null,
    change_summary: row.change_summary,
  };
}

export class PostgresMapDataRepository {
  private readonly policy = new AuthorizationPolicy();

  constructor(
    private readonly pool: Pool,
    private readonly transactions: PostgresTransactionManager,
    private readonly outbox: PostgresOutboxWriter,
  ) {}

  async preview(layerId: string, input: unknown, schemaVersion?: number) {
    const parsed = MapFeatureCollectionInputSchema.parse(input);
    const layer = await this.loadLayerSchema(this.pool, layerId, schemaVersion);
    const issues: Array<{
      feature_index: number;
      feature_id?: string;
      code:
        "GEOMETRY_INVALID" | "GEOMETRY_TYPE_MISMATCH" | "PROPERTIES_INVALID";
      detail: string;
    }> = [];
    for (const [index, feature] of parsed.features.entries()) {
      if (geometryName(feature) !== layer.layer_type) {
        issues.push({
          feature_index: index,
          feature_id: feature.id,
          code: "GEOMETRY_TYPE_MISMATCH",
          detail: `Expected ${layer.layer_type}`,
        });
        continue;
      }
      const propertyIssues = validateProperties(
        layer.schema_json,
        feature.properties,
      );
      if (propertyIssues.length) {
        issues.push({
          feature_index: index,
          feature_id: feature.id,
          code: "PROPERTIES_INVALID",
          detail: propertyIssues.join("; "),
        });
      }
      const topology = await this.pool.query<{
        valid: boolean;
        reason: string | null;
      }>(
        `SELECT ST_IsValid(geom) AS valid, (ST_IsValidDetail(geom)).reason AS reason
           FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom) candidate`,
        [JSON.stringify(feature.geometry)],
      );
      if (!topology.rows[0]?.valid) {
        issues.push({
          feature_index: index,
          feature_id: feature.id,
          code: "GEOMETRY_INVALID",
          detail: topology.rows[0]?.reason ?? "PostGIS rejected the geometry",
        });
      }
    }
    const rejected = new Set(issues.map((issue) => issue.feature_index)).size;
    return { accepted: parsed.features.length - rejected, rejected, issues };
  }

  async createVersion(
    layerId: string,
    areaId: string,
    accessScope: AccessScope,
    input: CreateMapVersion,
    traceId: string,
  ): Promise<MapVersion> {
    const scope = requireAccessScope(accessScope);
    this.assertAuthorized(
      scope,
      PolicyAction.MAP_DRAFT_WRITE,
      areaId,
      input.data_class,
    );
    const actorRef = scope.principalId;
    const preview = await this.preview(
      layerId,
      input.feature_collection,
      input.schema_version,
    );
    if (preview.rejected > 0)
      throw new MapDataFailure(
        "INVALID_GEOMETRY",
        "Import preview contains rejected features",
      );
    return this.transactions.execute(async (client) => {
      const layer = await this.loadLayerSchema(
        client,
        layerId,
        input.schema_version,
      );
      await client.query(
        "SELECT layer_id FROM map.layers WHERE layer_id = $1 FOR UPDATE",
        [layerId],
      );
      if (input.parent_version_id) {
        const parent = await client.query(
          "SELECT 1 FROM map.layer_versions WHERE version_id = $1 AND layer_id = $2",
          [input.parent_version_id, layerId],
        );
        if (!parent.rowCount)
          throw new MapDataFailure(
            "NOT_FOUND",
            "Parent version does not belong to this layer",
          );
      }
      const numberResult = await client.query<{ next_number: number }>(
        "SELECT COALESCE(max(version_number), 0) + 1 AS next_number FROM map.layer_versions WHERE layer_id = $1",
        [layerId],
      );
      const versionId = randomUUID();
      const parentFeatures = input.parent_version_id
        ? await client.query<{ feature_key: string; signature: string }>(
            "SELECT feature_key, md5(ST_AsEWKB(geom)::text || properties::text) AS signature FROM map.features WHERE version_id = $1",
            [input.parent_version_id],
          )
        : { rows: [] };
      const parent = new Map(
        parentFeatures.rows.map((row) => [row.feature_key, row.signature]),
      );
      const incoming = new Map(
        input.feature_collection.features.map((feature) => [
          feature.id,
          feature,
        ]),
      );
      let added = 0,
        updated = 0;
      for (const feature of input.feature_collection.features) {
        if (!parent.has(feature.id)) added += 1;
        else {
          const signatureResult = await client.query<{ signature: string }>(
            "SELECT md5(ST_AsEWKB(ST_SetSRID(ST_GeomFromGeoJSON($1),4326))::text || $2::jsonb::text) AS signature",
            [
              JSON.stringify(feature.geometry),
              JSON.stringify(feature.properties),
            ],
          );
          if (signatureResult.rows[0]?.signature !== parent.get(feature.id))
            updated += 1;
        }
      }
      const changeSummary = {
        added,
        updated,
        removed: [...parent.keys()].filter((key) => !incoming.has(key)).length,
      };
      const inserted = await client.query<
        VersionRow & { change_summary: MapVersion["change_summary"] }
      >(
        `INSERT INTO map.layer_versions
          (version_id, layer_id, version_number, schema_version, parent_version_id, area_id,
           data_class, valid_from, valid_to, change_summary, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
         RETURNING *, $12::text AS layer_key`,
        [
          versionId,
          layerId,
          numberResult.rows[0]?.next_number,
          input.schema_version,
          input.parent_version_id ?? null,
          areaId,
          input.data_class,
          new Date(input.valid_from),
          input.valid_to ? new Date(input.valid_to) : null,
          JSON.stringify(changeSummary),
          actorRef,
          layer.layer_key,
        ],
      );
      for (const feature of input.feature_collection.features) {
        await client.query(
          `INSERT INTO map.features
            (feature_key, layer_id, version_id, geom, properties, valid_from, valid_to, publish_state, created_by)
           VALUES ($1,$2,$3,ST_SetSRID(ST_GeomFromGeoJSON($4),4326),$5::jsonb,$6,$7,'DRAFT',$8)`,
          [
            feature.id,
            layerId,
            versionId,
            JSON.stringify(feature.geometry),
            JSON.stringify(feature.properties),
            new Date(input.valid_from),
            input.valid_to ? new Date(input.valid_to) : null,
            actorRef,
          ],
        );
      }
      await this.audit(
        client,
        actorRef,
        "map.version.create",
        versionId,
        areaId,
        traceId,
        { layer_id: layerId },
      );
      return contract(inserted.rows[0]!);
    });
  }

  async transition(
    versionId: string,
    areaId: string,
    accessScope: AccessScope,
    action: "submit" | "approve" | "publish" | "withdraw",
    traceId: string,
    reason?: string,
  ): Promise<MapVersion> {
    const scope = requireAccessScope(accessScope);
    const actorRef = scope.principalId;
    return this.transactions.execute(async (client) => {
      const result = await client.query<
        VersionRow & { change_summary: MapVersion["change_summary"] }
      >(
        `SELECT v.*, l.layer_key FROM map.layer_versions v JOIN map.layers l USING (layer_id)
          WHERE v.version_id = $1 AND v.area_id = $2 FOR UPDATE OF v`,
        [versionId, areaId],
      );
      const row = result.rows[0];
      if (!row)
        throw new MapDataFailure(
          "NOT_FOUND",
          "Map version was not found in this area",
        );
      this.assertAuthorized(
        scope,
        action === "submit"
          ? PolicyAction.MAP_DRAFT_WRITE
          : PolicyAction.MAP_PUBLISH,
        areaId,
        row.data_class,
      );
      let next: MapVersionSnapshot;
      try {
        if (action === "submit")
          next = submitMapVersion(snapshot(row), actorRef);
        else if (action === "approve")
          next = approveMapVersion(snapshot(row), actorRef);
        else if (action === "publish")
          next = publishMapVersion(snapshot(row), new Date());
        else next = withdrawMapVersion(snapshot(row));
      } catch (error) {
        const code =
          error instanceof Error && error.message === "MAKER_CHECKER"
            ? "MAKER_CHECKER"
            : "INVALID_STATE";
        throw new MapDataFailure(
          code,
          error instanceof Error ? error.message : "Invalid transition",
        );
      }
      const timestampColumn =
        action === "submit"
          ? "submitted_at"
          : action === "approve"
            ? "approved_at"
            : action === "publish"
              ? "published_at"
              : "withdrawn_at";
      const actorColumn =
        action === "submit"
          ? "submitted_by"
          : action === "approve"
            ? "approved_by"
            : null;
      await client.query(
        `UPDATE map.layer_versions SET state = $2, ${timestampColumn} = NOW()${actorColumn ? `, ${actorColumn} = $3` : ""} WHERE version_id = $1`,
        actorColumn
          ? [versionId, next.state, actorRef]
          : [versionId, next.state],
      );
      await client.query(
        "UPDATE map.features SET publish_state = $2 WHERE version_id = $1",
        [versionId, next.state],
      );
      await client.query(
        `INSERT INTO map.version_transitions (version_id, from_state, to_state, actor_ref, reason, trace_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [versionId, row.state, next.state, actorRef, reason ?? null, traceId],
      );
      if (action === "approve")
        await client.query(
          "INSERT INTO map.approvals (version_id, decision, actor_ref, trace_id) VALUES ($1,'APPROVED',$2,$3)",
          [versionId, actorRef, traceId],
        );
      await this.audit(
        client,
        actorRef,
        `map.version.${action}`,
        versionId,
        areaId,
        traceId,
        { from: row.state, to: next.state },
      );
      if (action === "publish" || action === "withdraw") {
        await this.appendLifecycleEvents(
          client,
          row,
          next.state as "PUBLISHED" | "WITHDRAWN",
          traceId,
        );
      }
      return contract({ ...row, state: next.state });
    });
  }

  async publicFeatures(layerKey: string, query: PublicMapQuery) {
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const version = await this.pool.query<{
      version_id: string;
      version_number: number;
      layer_key: string;
    }>(
      `SELECT v.version_id, v.version_number, l.layer_key
         FROM map.layers l JOIN map.layer_versions v USING (layer_id)
        WHERE l.layer_key = $1 AND l.is_public = true AND v.data_class = 'public'
          AND v.state = 'PUBLISHED' AND v.valid_from <= NOW()
          AND (v.valid_to IS NULL OR v.valid_to > NOW())
        ORDER BY v.version_number DESC LIMIT 1`,
      [layerKey],
    );
    const current = version.rows[0];
    if (!current)
      throw new MapDataFailure(
        "NOT_FOUND",
        "No effective public layer version was found",
      );
    const features = await this.pool.query<{
      id: string;
      geometry: MapFeatureInput["geometry"];
      properties: Record<string, unknown>;
    }>(
      `SELECT feature_key AS id, ST_AsGeoJSON(geom)::jsonb AS geometry, properties
         FROM map.features
        WHERE version_id = $1 AND publish_state = 'PUBLISHED'
          AND valid_from <= NOW() AND (valid_to IS NULL OR valid_to > NOW())
          AND geom && ST_MakeEnvelope($2,$3,$4,$5,4326)
        ORDER BY feature_key`,
      [current.version_id, minLon, minLat, maxLon, maxLat],
    );
    return {
      type: "FeatureCollection" as const,
      layer_key: current.layer_key,
      version: current.version_number,
      effective_at: new Date().toISOString(),
      features: features.rows.map((feature) => ({
        type: "Feature" as const,
        ...feature,
      })),
    };
  }

  private async loadLayerSchema(
    executor: Pick<Pool | PoolClient, "query">,
    layerId: string,
    schemaVersion?: number,
  ): Promise<LayerSchemaRow> {
    const result = await executor.query<LayerSchemaRow>(
      `SELECT l.layer_id, l.layer_key, l.layer_type, s.schema_version, s.schema_json
         FROM map.layers l JOIN map.layer_schemas s USING (layer_id)
        WHERE l.layer_id = $1 AND s.schema_version = COALESCE($2, (SELECT max(schema_version) FROM map.layer_schemas WHERE layer_id = $1 AND is_active))`,
      [layerId, schemaVersion ?? null],
    );
    if (!result.rows[0])
      throw new MapDataFailure("NOT_FOUND", "Layer schema was not found");
    return result.rows[0];
  }

  private assertAuthorized(
    scope: AccessScope,
    action: PolicyAction,
    areaId: string,
    dataClass: VersionRow["data_class"],
  ): void {
    const result = this.policy.evaluate(scope, {
      action,
      resource: { areaId, dataClass: dataClass as DataClass },
      stepUp: {
        mfaSatisfied: scope.authenticationMethods.includes("mfa"),
        authenticationMethods: scope.authenticationMethods,
      },
    });
    if (!result.allowed) {
      throw new MapDataFailure(
        "FORBIDDEN",
        "Map data access is outside the resolved scope",
      );
    }
  }

  private async audit(
    client: PoolClient,
    actorRef: string,
    action: string,
    versionId: string,
    areaId: string,
    traceId: string,
    metadata: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO audit.audit_events (who,action,object_type,object_id,scope,outcome,trace_id,metadata)
       VALUES ($1,$2,'map_version',$3,$4,'SUCCESS',$5,$6::jsonb)`,
      [actorRef, action, versionId, areaId, traceId, JSON.stringify(metadata)],
    );
  }

  private async appendLifecycleEvents(
    client: PoolClient,
    row: VersionRow,
    state: "PUBLISHED" | "WITHDRAWN",
    traceId: string,
  ) {
    const data = {
      layer_id: row.layer_id,
      layer_key: row.layer_key,
      version_id: row.version_id,
      version_number: row.version_number,
      state,
      cache_scope: `layer:${row.layer_key}`,
    };
    if (state === "PUBLISHED")
      await this.outbox.append(client, {
        event_id: randomUUID(),
        type: EVENT_ROUTING_KEYS.MAP_VERSION_PUBLISHED,
        version: 1,
        occurred_at: new Date().toISOString(),
        trace_id: traceId || createTraceId(),
        aggregate_id: row.version_id,
        aggregate_type: "map_version",
        data,
      });
    await this.outbox.append(client, {
      event_id: randomUUID(),
      type: EVENT_ROUTING_KEYS.MAP_CACHE_INVALIDATE,
      version: 1,
      occurred_at: new Date().toISOString(),
      trace_id: traceId || createTraceId(),
      aggregate_id: row.version_id,
      aggregate_type: "map_version",
      data,
    });
  }
}
