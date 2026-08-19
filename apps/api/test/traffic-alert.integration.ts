import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresTrafficAlertRepository } from "../src/modules/alerts/traffic-alert.repository";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";

interface FeatureFixture {
  key: string;
  properties: Record<string, unknown>;
  publishState?: "DRAFT" | "PUBLISHED";
  expired?: boolean;
}

describe("T13A published traffic-alert projection", () => {
  let pool: Pool;
  let layerId: string;
  const cleanupVersions: string[] = [];

  beforeAll(async () => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL });
    const layer = await pool.query<{ layer_id: string }>(
      "SELECT layer_id FROM map.layers WHERE layer_key='dangerous_points'",
    );
    layerId = layer.rows[0]!.layer_id;
  });

  afterEach(async () => {
    if (SKIP) return;
    while (cleanupVersions.length > 0) {
      const versionId = cleanupVersions.pop()!;
      await pool.query(
        "UPDATE map.layer_versions SET state='DRAFT' WHERE version_id=$1",
        [versionId],
      );
      await pool.query("DELETE FROM map.features WHERE version_id=$1", [
        versionId,
      ]);
      await pool.query("DELETE FROM map.layer_versions WHERE version_id=$1", [
        versionId,
      ]);
    }
  });

  afterAll(async () => {
    if (!SKIP) await pool.end();
  });

  async function publish(features: FeatureFixture[]): Promise<void> {
    const client = await pool.connect();
    const versionId = randomUUID();
    cleanupVersions.push(versionId);
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('traffic-alert-test-version'))",
      );
      const number = await client.query<{ value: number }>(
        "SELECT COALESCE(max(version_number),0)+1 AS value FROM map.layer_versions WHERE layer_id=$1",
        [layerId],
      );
      await client.query(
        `INSERT INTO map.layer_versions
           (version_id,layer_id,version_number,schema_version,area_id,data_class,
            state,valid_from,created_by,submitted_by,submitted_at,approved_by,
            approved_at,published_at)
         VALUES ($1,$2,$3,1,'area-dalat','public','DRAFT',NOW()-INTERVAL '1 hour',
                 'test-maker','test-maker',NOW(),'test-checker',NOW(),NOW())`,
        [versionId, layerId, number.rows[0]!.value],
      );
      for (const [index, feature] of features.entries()) {
        await client.query(
          `INSERT INTO map.features
             (feature_key,layer_id,version_id,geom,properties,valid_from,valid_to,
              publish_state,created_by)
           VALUES ($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326),$6::jsonb,
                   NOW()-INTERVAL '1 hour',
                   CASE WHEN $7 THEN NOW()-INTERVAL '1 minute' ELSE NULL END,
                   $8,'test-maker')`,
          [
            feature.key,
            layerId,
            versionId,
            108.4384 + index * 0.0001,
            11.9404,
            JSON.stringify(feature.properties),
            feature.expired ?? false,
            feature.publishState ?? "PUBLISHED",
          ],
        );
      }
      await client.query(
        "UPDATE map.layer_versions SET state='PUBLISHED' WHERE version_id=$1",
        [versionId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const alert = (vehicleTypes: string[]) => ({
    name: "Synthetic source",
    severity: "HIGH",
    alert: {
      priority: "WARNING",
      warning_vi: "Điểm nguy hiểm (FAKE)",
      action_vi: "Giảm tốc độ (FAKE)",
      vehicle_types: vehicleTypes,
    },
  });

  it("returns only current published alerts matching the requested vehicle", async () => {
    if (SKIP) return;
    await publish([
      { key: "all-vehicles", properties: alert(["ALL"]) },
      { key: "car-only", properties: alert(["CAR"]) },
      { key: "expired", properties: alert(["ALL"]), expired: true },
      {
        key: "draft",
        properties: alert(["ALL"]),
        publishState: "DRAFT",
      },
    ]);
    const repository = new PostgresTrafficAlertRepository(pool, {
      enabled: true,
      maxCandidates: 10,
      maxResults: 10,
    });
    const result = await repository.list({
      bbox: [108.4, 11.9, 108.5, 11.98],
      vehicle_type: "MOTORCYCLE",
    });
    expect(result).toMatchObject({
      source: "PUBLISHED_MAP_DATA",
      quality: "PUBLISHED",
      capability: "BBOX_ONLY",
    });
    expect(result.alerts.map((item) => item.feature_key)).toEqual([
      "all-vehicles",
    ]);
    expect(result.alerts[0]).not.toHaveProperty("name");
  });

  it("fails closed when a current published feature has malformed alert data", async () => {
    if (SKIP) return;
    await publish([
      {
        key: "invalid-source",
        properties: { name: "Synthetic", severity: "HIGH", alert: {} },
      },
    ]);
    const repository = new PostgresTrafficAlertRepository(pool, {
      enabled: true,
      maxCandidates: 10,
      maxResults: 10,
    });
    await expect(
      repository.list({
        bbox: [108.4, 11.9, 108.5, 11.98],
        vehicle_type: "CAR",
      }),
    ).rejects.toMatchObject({ code: "SOURCE_INVALID" });
  });

  it("rejects a broad bbox instead of silently truncating candidates", async () => {
    if (SKIP) return;
    await publish([
      { key: "candidate-one", properties: alert(["ALL"]) },
      { key: "candidate-two", properties: alert(["ALL"]) },
    ]);
    const repository = new PostgresTrafficAlertRepository(pool, {
      enabled: true,
      maxCandidates: 1,
      maxResults: 1,
    });
    await expect(
      repository.list({
        bbox: [108.4, 11.9, 108.5, 11.98],
        vehicle_type: "CAR",
      }),
    ).rejects.toMatchObject({ code: "QUERY_TOO_BROAD" });
  });
});
