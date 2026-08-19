-- ============================================================
-- ATGT Dev Seed - Fake Lam Dong data for local development
-- IMPORTANT: All data is FAKE. No real persons, incidents, or locations.
-- ============================================================

\connect atgt_dev

INSERT INTO incident.incident_type_catalog (code, label_vi, label_en, priority) VALUES
  ('TRAFFIC_ACCIDENT',   N'Tai nạn giao thông',         'Traffic Accident',    'CRITICAL'),
  ('CNCH',               N'Cứu nạn cứu hộ',              'Search and Rescue',   'CRITICAL'),
  ('TRAFFIC_CONGESTION', N'Ùn tắc giao thông',           'Traffic Congestion',  'MEDIUM'),
  ('ROAD_HAZARD',        N'Nguy hiểm đường bộ',          'Road Hazard',         'HIGH'),
  ('VEHICLE_FIRE',       N'Xe bốc cháy',                 'Vehicle Fire',        'CRITICAL'),
  ('PEDESTRIAN_HAZARD',  N'Nguy hiểm người đi bộ',       'Pedestrian Hazard',   'HIGH')
ON CONFLICT (code) DO NOTHING;

INSERT INTO report.category_catalog (code, label_vi, label_en) VALUES
  ('TRAFFIC_VIOLATION', N'Vi phạm giao thông (FAKE)', 'Traffic violation (FAKE)'),
  ('DANGEROUS_DRIVING', N'Lái xe nguy hiểm (FAKE)', 'Dangerous driving (FAKE)'),
  ('ILLEGAL_PARKING', N'Dừng đỗ không đúng quy định (FAKE)', 'Illegal parking (FAKE)')
ON CONFLICT (code) DO NOTHING;

-- Fake unit: Da Lat district patrol (synthetic)
INSERT INTO dispatch.units (unit_code, unit_name, capability, service_area, availability) VALUES
  (
    'PC08-DL-001',
    N'Tổ tuần tra Đà Lạt (FAKE - dev only)',
    ARRAY['TRAFFIC_ACCIDENT', 'ROAD_HAZARD', 'TRAFFIC_CONGESTION'],
    ST_GeomFromText('POLYGON((108.38 11.90, 108.50 11.90, 108.50 11.98, 108.38 11.98, 108.38 11.90))', 4326),
    'AVAILABLE'
  ),
  (
    'PC08-DL-002',
    N'Tổ CNCH Đà Lạt (FAKE - dev only)',
    ARRAY['CNCH', 'TRAFFIC_ACCIDENT', 'VEHICLE_FIRE'],
    ST_GeomFromText('POLYGON((108.40 11.91, 108.48 11.91, 108.48 11.97, 108.40 11.97, 108.40 11.91))', 4326),
    'AVAILABLE'
  ),
  (
    'PC08-BL-001',
    N'Tổ tuần tra Bảo Lộc (FAKE - dev only)',
    ARRAY['TRAFFIC_ACCIDENT', 'ROAD_HAZARD'],
    ST_GeomFromText('POLYGON((107.75 11.52, 107.87 11.52, 107.87 11.58, 107.75 11.58, 107.75 11.52))', 4326),
    'AVAILABLE'
  )
ON CONFLICT (unit_code) DO NOTHING;

INSERT INTO map.layers (layer_key, layer_name, layer_type, description, is_public) VALUES
  ('dangerous_points',  N'Điểm đen nguy hiểm',     'POINT',   N'Điểm tai nạn nhiều lần',      true),
  ('road_closures',     N'Đường cấm/hạn chế',       'LINE',    N'Đường đang cấm hoặc hạn chế', true),
  ('parking_zones',     N'Bãi đỗ xe',               'POLYGON', N'Bãi đỗ xe công cộng',         true),
  ('no_parking',        N'Cấm dừng đỗ',             'LINE',    N'Đoạn đường cấm dừng đỗ',      true),
  ('temp_events',       N'Sự kiện tạm thời',         'POINT',   N'Sự kiện ảnh hưởng giao thông', true)
ON CONFLICT (layer_key) DO NOTHING;

INSERT INTO map.layer_schemas
  (layer_id, schema_version, geometry_type, schema_json, is_active, created_by)
SELECT l.layer_id, 1, l.layer_type,
  '{"type":"object","additionalProperties":true}'::jsonb, true, 'seed'
FROM map.layers l
ON CONFLICT (layer_id, schema_version) DO NOTHING;

-- Seed fake dangerous points around Da Lat
INSERT INTO map.layer_schemas
  (layer_id, schema_version, geometry_type, schema_json, is_active, created_by)
SELECT l.layer_id, 1, l.layer_type,
  '{"type":"object","required":["name","severity"],"properties":{"name":{"type":"string"},"accident_count":{"type":"integer","minimum":0},"severity":{"type":"string","enum":["LOW","MEDIUM","HIGH"]}},"additionalProperties":false}'::jsonb,
  true, 'seed'
FROM map.layers l WHERE l.layer_key = 'dangerous_points'
ON CONFLICT (layer_id, schema_version) DO UPDATE SET schema_json = EXCLUDED.schema_json;

INSERT INTO map.layer_versions
  (version_id, layer_id, version_number, schema_version, area_id, data_class, state,
   valid_from, change_summary, created_by, submitted_by, submitted_at,
   approved_by, approved_at, published_at)
SELECT '00000000-0000-4000-8000-000000000601'::uuid, l.layer_id, 1, 1,
  'area-dalat', 'public', 'DRAFT', '2026-01-01T00:00:00Z',
  '{"added":1,"updated":0,"removed":0}'::jsonb, 'seed-maker', 'seed-maker', NOW(),
  'seed-checker', NOW(), NOW()
FROM map.layers l WHERE l.layer_key = 'dangerous_points'
ON CONFLICT (version_id) DO NOTHING;

INSERT INTO map.features
  (feature_id, feature_key, layer_id, version_id, geom, properties, valid_from, publish_state, created_by)
SELECT '00000000-0000-4000-8000-000000000602'::uuid, 'danger-hoabinh-fake', l.layer_id,
  '00000000-0000-4000-8000-000000000601'::uuid,
  ST_SetSRID(ST_MakePoint(108.4384, 11.9404), 4326),
  '{"name": "Ngã tư Hòa Bình (FAKE)", "accident_count": 12, "severity": "HIGH"}'::jsonb,
  '2026-01-01T00:00:00Z', 'DRAFT', 'seed-maker'
FROM map.layers l WHERE l.layer_key = 'dangerous_points'
ON CONFLICT (feature_id) DO NOTHING;

UPDATE map.layer_versions SET state = 'PUBLISHED'
WHERE version_id = '00000000-0000-4000-8000-000000000601'::uuid;
UPDATE map.features SET publish_state = 'PUBLISHED'
WHERE version_id = '00000000-0000-4000-8000-000000000601'::uuid;

COMMENT ON TABLE incident.incident_type_catalog IS 'Fake seed - replace with approved catalog before UAT';
COMMENT ON TABLE dispatch.units IS 'Fake seed - import real GeoJSON + capability catalog before T08/UAT (D-05)';
