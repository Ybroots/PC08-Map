-- ============================================================
-- ATGT Dev Seed - Fake Lam Dong data for local development
-- IMPORTANT: All data is FAKE. No real persons, incidents, or locations.
-- ============================================================

\connect atgt_dev

-- ============================================================
-- Fake incident types (will be config-driven in T07)
-- ============================================================
CREATE TABLE IF NOT EXISTS incident.incident_type_catalog (
  code        TEXT PRIMARY KEY,
  label_vi    TEXT NOT NULL,
  label_en    TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'HIGH',
  enabled     BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO incident.incident_type_catalog (code, label_vi, label_en, priority) VALUES
  ('TRAFFIC_ACCIDENT',   N'Tai nạn giao thông',         'Traffic Accident',    'CRITICAL'),
  ('CNCH',               N'Cứu nạn cứu hộ',              'Search and Rescue',   'CRITICAL'),
  ('TRAFFIC_CONGESTION', N'Ùn tắc giao thông',           'Traffic Congestion',  'MEDIUM'),
  ('ROAD_HAZARD',        N'Nguy hiểm đường bộ',          'Road Hazard',         'HIGH'),
  ('VEHICLE_FIRE',       N'Xe bốc cháy',                 'Vehicle Fire',        'CRITICAL'),
  ('PEDESTRIAN_HAZARD',  N'Nguy hiểm người đi bộ',       'Pedestrian Hazard',   'HIGH')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- Fake dispatch units (synthetic - not real units)
-- ============================================================
CREATE TABLE IF NOT EXISTS dispatch.units (
  unit_id       UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  unit_code     TEXT        NOT NULL UNIQUE,
  unit_name     TEXT        NOT NULL,
  capability    TEXT[]      NOT NULL DEFAULT '{}',
  service_area  GEOMETRY(Polygon, 4326),
  availability  TEXT        NOT NULL DEFAULT 'AVAILABLE',
  contact_ref   TEXT,       -- Reference only; no real contact data
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- ============================================================
-- Fake map layers (published - visible on public map)
-- ============================================================
CREATE TABLE IF NOT EXISTS map.layers (
  layer_id    UUID    PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  layer_key   TEXT    NOT NULL UNIQUE,
  layer_name  TEXT    NOT NULL,
  layer_type  TEXT    NOT NULL,   -- POINT, LINE, POLYGON
  description TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO map.layers (layer_key, layer_name, layer_type, description, is_public) VALUES
  ('dangerous_points',  N'Điểm đen nguy hiểm',     'POINT',   N'Điểm tai nạn nhiều lần',      true),
  ('road_closures',     N'Đường cấm/hạn chế',       'LINE',    N'Đường đang cấm hoặc hạn chế', true),
  ('parking_zones',     N'Bãi đỗ xe',               'POLYGON', N'Bãi đỗ xe công cộng',         true),
  ('no_parking',        N'Cấm dừng đỗ',             'LINE',    N'Đoạn đường cấm dừng đỗ',      true),
  ('temp_events',       N'Sự kiện tạm thời',         'POINT',   N'Sự kiện ảnh hưởng giao thông', true)
ON CONFLICT (layer_key) DO NOTHING;

-- Fake published dangerous point (Da Lat city center intersection)
CREATE TABLE IF NOT EXISTS map.features (
  feature_id    UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  layer_id      UUID        NOT NULL REFERENCES map.layers(layer_id),
  version_id    UUID        NOT NULL DEFAULT public.uuid_generate_v4(),
  geom          GEOMETRY(Geometry, 4326) NOT NULL,
  properties    JSONB       NOT NULL DEFAULT '{}',
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to      TIMESTAMPTZ,           -- NULL = permanent
  publish_state TEXT        NOT NULL DEFAULT 'PUBLISHED',
  created_by    TEXT        NOT NULL DEFAULT 'seed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS features_geom_idx ON map.features USING GIST(geom);
CREATE INDEX IF NOT EXISTS features_layer_state_idx ON map.features (layer_id, publish_state);

-- Seed fake dangerous points around Da Lat
INSERT INTO map.features (layer_id, geom, properties, publish_state)
SELECT
  l.layer_id,
  ST_SetSRID(ST_MakePoint(108.4384, 11.9404), 4326),
  '{"name": "Ngã tư Hòa Bình (FAKE)", "accident_count": 12, "severity": "HIGH"}'::jsonb,
  'PUBLISHED'
FROM map.layers l WHERE l.layer_key = 'dangerous_points'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE incident.incident_type_catalog IS 'Fake seed - replace with approved catalog before UAT';
COMMENT ON TABLE dispatch.units IS 'Fake seed - import real GeoJSON + capability catalog before T08/UAT (D-05)';
