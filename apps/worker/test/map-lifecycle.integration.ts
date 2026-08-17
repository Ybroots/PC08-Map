import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { MapLifecycleJob } from "../src/map-lifecycle.job";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev";
const ADMIN_DATABASE_URL =
  process.env["ADMIN_DATABASE_URL"] ??
  "postgresql://postgres:devpassword_local@localhost:5432/atgt_dev";

describe("T06 map lifecycle worker", () => {
  let pool: Pool;
  let admin: Pool;
  const versionId = randomUUID();
  const featureId = randomUUID();

  beforeAll(async () => {
    if (SKIP) return;
    pool = new Pool({ connectionString: DATABASE_URL });
    admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    const layer = await pool.query<{ layer_id: string; next_number: number }>(
      `SELECT layer_id, (SELECT max(version_number) + 1 FROM map.layer_versions WHERE layer_id = l.layer_id) AS next_number
         FROM map.layers l WHERE layer_key = 'dangerous_points'`,
    );
    await pool.query(
      `INSERT INTO map.layer_versions
        (version_id,layer_id,version_number,schema_version,area_id,data_class,state,valid_from,valid_to,created_by,submitted_by,submitted_at,approved_by,approved_at,published_at)
       VALUES ($1,$2,$3,1,'test-t06','public','DRAFT',NOW()-INTERVAL '2 hours',NOW()-INTERVAL '1 hour','maker','maker',NOW()-INTERVAL '3 hours','checker',NOW()-INTERVAL '2 hours',NOW()-INTERVAL '2 hours')`,
      [versionId, layer.rows[0]!.layer_id, layer.rows[0]!.next_number],
    );
    await pool.query(
      `INSERT INTO map.features (feature_id,feature_key,layer_id,version_id,geom,properties,valid_from,valid_to,publish_state,created_by)
       VALUES ($1,'expiry-smoke',$2,$3,ST_SetSRID(ST_MakePoint(108.45,11.95),4326),'{}',NOW()-INTERVAL '2 hours',NOW()-INTERVAL '1 hour','DRAFT','maker')`,
      [featureId, layer.rows[0]!.layer_id, versionId],
    );
    await pool.query(
      "UPDATE map.layer_versions SET state='PUBLISHED' WHERE version_id=$1",
      [versionId],
    );
    await pool.query(
      "UPDATE map.features SET publish_state='PUBLISHED' WHERE version_id=$1",
      [versionId],
    );
  });

  afterAll(async () => {
    if (SKIP) return;
    await admin.query("DELETE FROM platform.outbox WHERE aggregate_id = $1", [
      versionId,
    ]);
    await admin.query("DELETE FROM audit.audit_events WHERE object_id = $1", [
      versionId,
    ]);
    await admin.query(
      "DELETE FROM map.version_transitions WHERE version_id = $1",
      [versionId],
    );
    await admin.query(
      "UPDATE map.layer_versions SET state = 'DRAFT' WHERE version_id = $1",
      [versionId],
    );
    await admin.query("DELETE FROM map.features WHERE version_id = $1", [
      versionId,
    ]);
    await admin.query("DELETE FROM map.layer_versions WHERE version_id = $1", [
      versionId,
    ]);
    await pool.end();
    await admin.end();
  });

  it("expires due data and writes both lifecycle and invalidation events atomically", async () => {
    if (SKIP) return;
    await expect(new MapLifecycleJob(pool).runOnce()).resolves.toMatchObject({
      expired: 1,
    });
    const result = await pool.query<{
      state: string;
      feature_state: string;
      event_types: string[];
    }>(
      `SELECT v.state, f.publish_state AS feature_state,
              ARRAY(SELECT event_type FROM platform.outbox WHERE aggregate_id = $1::uuid::text ORDER BY event_type) AS event_types
         FROM map.layer_versions v JOIN map.features f USING(version_id) WHERE v.version_id = $1`,
      [versionId],
    );
    expect(result.rows[0]).toEqual({
      state: "EXPIRED",
      feature_state: "EXPIRED",
      event_types: ["map.cache.invalidate.v1", "map.version.expired.v1"],
    });
    await expect(new MapLifecycleJob(pool).runOnce()).resolves.toMatchObject({
      expired: 0,
    });
  });
});
