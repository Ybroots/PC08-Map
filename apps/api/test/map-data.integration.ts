import { randomUUID } from "node:crypto";
import { createAccessScope, DataClass, OfficerRole } from "@atgt/authorization";
import { Pool } from "pg";
import { PostgresMapDataRepository } from "../src/modules/map-data/map-data.repository";
import { PostgresOutboxWriter } from "../src/platform/database/outbox-writer";
import { PostgresTransactionManager } from "../src/platform/database/transaction-manager";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";

describe("T06 map data integration", () => {
  let pool: Pool;
  let maps: PostgresMapDataRepository;
  let dangerousLayerId: string;
  let polygonLayerId: string;
  const cleanupVersions: string[] = [];

  async function insertDraftVersion(
    versionId: string,
    dataClass: "public" | "internal",
    selfSubmitted = false,
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        dangerousLayerId,
      ]);
      const number = await client.query<{ value: number }>(
        "SELECT COALESCE(max(version_number),0)+1 AS value FROM map.layer_versions WHERE layer_id=$1",
        [dangerousLayerId],
      );
      await client.query(
        `INSERT INTO map.layer_versions
           (version_id,layer_id,version_number,schema_version,area_id,data_class,state,
            valid_from,created_by,submitted_by,submitted_at)
         VALUES ($1,$2,$3,1,'area-dalat',$4,'DRAFT',NOW(),$5,$6,
                 CASE WHEN $6::text IS NULL THEN NULL ELSE NOW() END)`,
        [
          versionId,
          dangerousLayerId,
          number.rows[0]!.value,
          dataClass,
          selfSubmitted ? "same-actor" : "test-maker",
          selfSubmitted ? "same-actor" : null,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL });
    maps = new PostgresMapDataRepository(
      pool,
      new PostgresTransactionManager(pool),
      new PostgresOutboxWriter(),
    );
    const layers = await pool.query<{ layer_id: string; layer_key: string }>(
      "SELECT layer_id,layer_key FROM map.layers WHERE layer_key IN ('dangerous_points','parking_zones')",
    );
    dangerousLayerId = layers.rows.find(
      (row) => row.layer_key === "dangerous_points",
    )!.layer_id;
    polygonLayerId = layers.rows.find(
      (row) => row.layer_key === "parking_zones",
    )!.layer_id;
  });

  afterAll(async () => {
    if (SKIP) return;
    for (const versionId of cleanupVersions) {
      await pool.query(
        "UPDATE map.layer_versions SET state = 'DRAFT' WHERE version_id = $1",
        [versionId],
      );
      await pool.query("DELETE FROM map.features WHERE version_id = $1", [
        versionId,
      ]);
      await pool.query("DELETE FROM map.layer_versions WHERE version_id = $1", [
        versionId,
      ]);
    }
    await pool.end();
  });

  it("reports a self-intersecting polygon before import", async () => {
    if (SKIP) return;
    const result = await maps.preview(
      polygonLayerId,
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "bow-tie",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [108.4, 11.9],
                  [108.5, 12],
                  [108.5, 11.9],
                  [108.4, 12],
                  [108.4, 11.9],
                ],
              ],
            },
          },
        ],
      },
      1,
    );
    expect(result).toMatchObject({ accepted: 0, rejected: 1 });
    expect(result.issues[0]?.code).toBe("GEOMETRY_INVALID");
  });

  it("denies an editor creating data above the resolved classification", async () => {
    if (SKIP) return;
    const scope = createAccessScope({
      principalId: "test-editor",
      role: OfficerRole.DATA_EDITOR,
      areaIds: ["area-dalat"],
      maxDataClass: DataClass.INTERNAL,
    });
    await expect(
      maps.createVersion(
        dangerousLayerId,
        "area-dalat",
        scope,
        {
          schema_version: 1,
          data_class: "restricted",
          valid_from: new Date().toISOString(),
          feature_collection: { type: "FeatureCollection", features: [] },
        },
        randomUUID().replaceAll("-", ""),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("never leaks a draft into the public bbox response", async () => {
    if (SKIP) return;
    const versionId = randomUUID();
    cleanupVersions.push(versionId);
    await insertDraftVersion(versionId, "public");
    await pool.query(
      `INSERT INTO map.features (feature_key,layer_id,version_id,geom,properties,valid_from,publish_state,created_by)
       VALUES ('draft-must-not-leak',$1,$2,ST_SetSRID(ST_MakePoint(108.44,11.94),4326),'{}',NOW()-INTERVAL '1 hour','DRAFT','test-maker')`,
      [dangerousLayerId, versionId],
    );
    const result = await maps.publicFeatures("dangerous_points", {
      bbox: [108.4, 11.9, 108.5, 11.98],
      zoom: 13,
    });
    expect(result.features.map((feature) => feature.id)).not.toContain(
      "draft-must-not-leak",
    );
    expect(result.features.map((feature) => feature.id)).toContain(
      "danger-hoabinh-fake",
    );
  });

  it("keeps the bbox predicate on the PostGIS spatial index", async () => {
    if (SKIP) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL enable_seqscan = off");
      const plan = await client.query<{ "QUERY PLAN": string }>(
        `EXPLAIN SELECT feature_key FROM map.features
          WHERE geom && ST_MakeEnvelope(108.4,11.9,108.5,11.98,4326)`,
      );
      expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
        "map_features_geom_idx",
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("locks feature content after submit and rejects self-approval at the database boundary", async () => {
    if (SKIP) return;
    const versionId = randomUUID();
    cleanupVersions.push(versionId);
    await insertDraftVersion(versionId, "internal", true);
    await pool.query(
      `INSERT INTO map.features (feature_key,layer_id,version_id,geom,properties,valid_from,publish_state,created_by)
       VALUES ('immutable-smoke',$1,$2,ST_SetSRID(ST_MakePoint(108.44,11.94),4326),'{}',NOW(),'DRAFT','same-actor')`,
      [dangerousLayerId, versionId],
    );
    await pool.query(
      "UPDATE map.layer_versions SET state='IN_REVIEW' WHERE version_id=$1",
      [versionId],
    );
    await pool.query(
      "UPDATE map.features SET publish_state='IN_REVIEW' WHERE version_id=$1",
      [versionId],
    );
    await expect(
      pool.query(
        "UPDATE map.features SET properties = '{\"changed\":true}' WHERE version_id = $1",
        [versionId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query(
        "UPDATE map.layer_versions SET valid_to = NOW() + INTERVAL '1 day' WHERE version_id = $1",
        [versionId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query(
        "UPDATE map.layer_versions SET approved_by='same-actor', approved_at=NOW(), state='APPROVED' WHERE version_id=$1",
        [versionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
