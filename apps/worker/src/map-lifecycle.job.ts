import type { Pool } from "pg";

export interface MapLifecycleResult {
  published: number;
  expired: number;
}

/**
 * Idempotent clock transition. Row locks make overlapping worker ticks safe;
 * lifecycle events and cache invalidations are committed with each state change.
 */
export class MapLifecycleJob {
  constructor(private readonly pool: Pool) {}

  async runOnce(): Promise<MapLifecycleResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const published = await client.query<{ version_id: string }>(
        `WITH due AS (
           SELECT v.version_id, v.layer_id, v.version_number, l.layer_key
             FROM map.layer_versions v JOIN map.layers l USING (layer_id)
            WHERE v.state = 'APPROVED' AND v.valid_from <= NOW()
              AND (v.valid_to IS NULL OR v.valid_to > NOW())
            FOR UPDATE OF v SKIP LOCKED
         ), changed AS (
           UPDATE map.layer_versions v SET state = 'PUBLISHED', published_at = NOW()
             FROM due WHERE v.version_id = due.version_id
           RETURNING v.version_id, v.layer_id, v.version_number, due.layer_key
         ), features AS (
           UPDATE map.features f SET publish_state = 'PUBLISHED'
             FROM changed WHERE f.version_id = changed.version_id
         ), history AS (
           INSERT INTO map.version_transitions
             (version_id, from_state, to_state, actor_ref, reason, trace_id)
           SELECT version_id, 'APPROVED', 'PUBLISHED', 'system:map-lifecycle',
                  'effective clock reached', md5(random()::text || clock_timestamp()::text)
             FROM changed
         ), audit_rows AS (
           INSERT INTO audit.audit_events
             (who, action, object_type, object_id, outcome, reason, trace_id, metadata)
           SELECT 'system:map-lifecycle', 'map.version.publish', 'map_version', version_id::text,
                  'SUCCESS', 'effective clock reached', md5(random()::text || clock_timestamp()::text),
                  jsonb_build_object('layer_id', layer_id, 'version_number', version_number)
             FROM changed
         ), events AS (
           INSERT INTO platform.outbox
             (event_id, aggregate_id, aggregate_type, event_type, payload, occurred_at, event_version, trace_id)
           SELECT public.uuid_generate_v4(), version_id::text, 'map_version', event_type,
                  jsonb_build_object('layer_id', layer_id, 'layer_key', layer_key,
                    'version_id', version_id, 'version_number', version_number,
                    'state', 'PUBLISHED', 'cache_scope', 'layer:' || layer_key),
                  NOW(), 1, md5(random()::text || clock_timestamp()::text)
             FROM changed CROSS JOIN (VALUES ('map.version.published.v1'), ('map.cache.invalidate.v1')) e(event_type)
         ) SELECT version_id FROM changed`,
      );
      const expired = await client.query<{ version_id: string }>(
        `WITH due AS (
           SELECT v.version_id, v.layer_id, v.version_number, l.layer_key
             FROM map.layer_versions v JOIN map.layers l USING (layer_id)
            WHERE v.state = 'PUBLISHED' AND v.valid_to IS NOT NULL AND v.valid_to <= NOW()
            FOR UPDATE OF v SKIP LOCKED
         ), changed AS (
           UPDATE map.layer_versions v SET state = 'EXPIRED', expired_at = NOW()
             FROM due WHERE v.version_id = due.version_id
           RETURNING v.version_id, v.layer_id, v.version_number, due.layer_key
         ), features AS (
           UPDATE map.features f SET publish_state = 'EXPIRED'
             FROM changed WHERE f.version_id = changed.version_id
         ), history AS (
           INSERT INTO map.version_transitions
             (version_id, from_state, to_state, actor_ref, reason, trace_id)
           SELECT version_id, 'PUBLISHED', 'EXPIRED', 'system:map-lifecycle',
                  'valid_to elapsed', md5(random()::text || clock_timestamp()::text)
             FROM changed
         ), audit_rows AS (
           INSERT INTO audit.audit_events
             (who, action, object_type, object_id, outcome, reason, trace_id, metadata)
           SELECT 'system:map-lifecycle', 'map.version.expire', 'map_version', version_id::text,
                  'SUCCESS', 'valid_to elapsed', md5(random()::text || clock_timestamp()::text),
                  jsonb_build_object('layer_id', layer_id, 'version_number', version_number)
             FROM changed
         ), events AS (
           INSERT INTO platform.outbox
             (event_id, aggregate_id, aggregate_type, event_type, payload, occurred_at, event_version, trace_id)
           SELECT public.uuid_generate_v4(), version_id::text, 'map_version', event_type,
                  jsonb_build_object('layer_id', layer_id, 'layer_key', layer_key,
                    'version_id', version_id, 'version_number', version_number,
                    'state', 'EXPIRED', 'cache_scope', 'layer:' || layer_key),
                  NOW(), 1, md5(random()::text || clock_timestamp()::text)
             FROM changed CROSS JOIN (VALUES ('map.version.expired.v1'), ('map.cache.invalidate.v1')) e(event_type)
         ) SELECT version_id FROM changed`,
      );
      await client.query("COMMIT");
      return {
        published: published.rowCount ?? 0,
        expired: expired.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
