-- ============================================================
-- T04 Core data platform and PostGIS tables
-- Workflow-specific transitions remain owned by T06-T10.
-- ============================================================

\connect atgt_dev

-- ============================================================
-- Incident data
-- ============================================================
CREATE TABLE IF NOT EXISTS incident.incident_type_catalog (
  code        TEXT    PRIMARY KEY
                      CHECK (code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  label_vi    TEXT    NOT NULL CHECK (length(trim(label_vi)) > 0),
  label_en    TEXT    NOT NULL CHECK (length(trim(label_en)) > 0),
  priority    TEXT    NOT NULL
                      CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  enabled     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS incident.incidents (
  id            UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  public_code   CHAR(12)    NOT NULL UNIQUE
                            CHECK (public_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$'),
  type          TEXT        NOT NULL REFERENCES incident.incident_type_catalog(code),
  priority      TEXT        NOT NULL
                            CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  longitude     DOUBLE PRECISION NOT NULL
                            CHECK (longitude BETWEEN -180 AND 180),
  latitude      DOUBLE PRECISION NOT NULL
                            CHECK (latitude BETWEEN -90 AND 90),
  geom          GEOGRAPHY(Point, 4326)
                GENERATED ALWAYS AS (
                  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
                ) STORED,
  accuracy_m    NUMERIC(8,2)
                            CHECK (accuracy_m IS NULL OR accuracy_m BETWEEN 0 AND 10000),
  description   TEXT        CHECK (description IS NULL OR length(description) BETWEEN 1 AND 500),
  occurred_at   TIMESTAMPTZ NOT NULL,
  state         TEXT        NOT NULL
                            CHECK (state IN (
                              'RECEIVED', 'AUTO_SCREENING', 'PENDING_VERIFICATION',
                              'VERIFIED', 'ASSIGNED', 'ACKNOWLEDGED', 'EN_ROUTE',
                              'ON_SCENE', 'RESOLVED', 'CLOSED', 'REJECTED',
                              'DUPLICATE', 'ESCALATED', 'REASSIGNED', 'CANCELLED'
                            )),
  source        TEXT        NOT NULL
                            CHECK (source IN ('MOBILE_SOS', 'WEB', 'MANUAL')),
  area_id       TEXT        NOT NULL CHECK (length(trim(area_id)) BETWEEN 1 AND 100),
  data_class    TEXT        NOT NULL
                            CHECK (data_class IN ('public', 'internal', 'sensitive', 'restricted')),
  version       INTEGER     NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT incident_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS incidents_geom_idx
  ON incident.incidents USING GIST (geom);
CREATE INDEX IF NOT EXISTS incidents_area_state_idx
  ON incident.incidents (area_id, state, occurred_at DESC);
CREATE INDEX IF NOT EXISTS incidents_active_created_idx
  ON incident.incidents (created_at DESC)
  WHERE state NOT IN ('CLOSED', 'REJECTED', 'DUPLICATE', 'CANCELLED');

CREATE TABLE IF NOT EXISTS incident.status_history (
  id            UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  incident_id   UUID        NOT NULL REFERENCES incident.incidents(id),
  from_state    TEXT        CHECK (
                              from_state IS NULL OR from_state IN (
                                'RECEIVED', 'AUTO_SCREENING', 'PENDING_VERIFICATION',
                                'VERIFIED', 'ASSIGNED', 'ACKNOWLEDGED', 'EN_ROUTE',
                                'ON_SCENE', 'RESOLVED', 'CLOSED', 'REJECTED',
                                'DUPLICATE', 'ESCALATED', 'REASSIGNED', 'CANCELLED'
                              )
                            ),
  to_state      TEXT        NOT NULL CHECK (
                              to_state IN (
                                'RECEIVED', 'AUTO_SCREENING', 'PENDING_VERIFICATION',
                                'VERIFIED', 'ASSIGNED', 'ACKNOWLEDGED', 'EN_ROUTE',
                                'ON_SCENE', 'RESOLVED', 'CLOSED', 'REJECTED',
                                'DUPLICATE', 'ESCALATED', 'REASSIGNED', 'CANCELLED'
                              )
                            ),
  actor_ref     TEXT        NOT NULL CHECK (length(trim(actor_ref)) BETWEEN 1 AND 200),
  reason        TEXT,
  trace_id      TEXT        NOT NULL CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS incident_status_history_idx
  ON incident.status_history (incident_id, created_at ASC);

REVOKE UPDATE, DELETE, TRUNCATE ON incident.status_history FROM atgt_app;

COMMENT ON TABLE incident.incidents IS
  'PII-free incident business records. Citizen session, IP, fingerprint and account identity are forbidden.';
COMMENT ON COLUMN incident.incidents.geom IS
  'Generated EPSG:4326 geography point from validated longitude/latitude.';
COMMENT ON TABLE incident.status_history IS
  'Append-only incident transition history; application role cannot update or delete rows.';

-- ============================================================
-- Dispatch base tables. D-05 keeps service-area/catalog synthetic.
-- ============================================================
CREATE TABLE IF NOT EXISTS dispatch.units (
  unit_id       UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  unit_code     TEXT        NOT NULL UNIQUE,
  unit_name     TEXT        NOT NULL,
  capability    TEXT[]      NOT NULL DEFAULT '{}',
  service_area  GEOMETRY(Polygon, 4326),
  availability  TEXT        NOT NULL DEFAULT 'AVAILABLE',
  contact_ref   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dispatch_unit_service_area_valid CHECK (
    service_area IS NULL OR ST_IsValid(service_area)
  ),
  CONSTRAINT dispatch_unit_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS dispatch_units_service_area_idx
  ON dispatch.units USING GIST (service_area);

CREATE TABLE IF NOT EXISTS dispatch.assignments (
  assignment_id   UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  incident_id     UUID        NOT NULL REFERENCES incident.incidents(id),
  unit_id         UUID        NOT NULL REFERENCES dispatch.units(unit_id),
  assigned_by_ref TEXT        NOT NULL CHECK (length(trim(assigned_by_ref)) BETWEEN 1 AND 200),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  on_scene_at     TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  CONSTRAINT dispatch_assignment_time_order CHECK (
    (acknowledged_at IS NULL OR acknowledged_at >= assigned_at)
    AND (on_scene_at IS NULL OR on_scene_at >= COALESCE(acknowledged_at, assigned_at))
    AND (ended_at IS NULL OR ended_at >= COALESCE(on_scene_at, acknowledged_at, assigned_at))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_one_active_assignment_idx
  ON dispatch.assignments (incident_id)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS dispatch_active_unit_assignments_idx
  ON dispatch.assignments (unit_id, assigned_at DESC)
  WHERE ended_at IS NULL;

COMMENT ON TABLE dispatch.units IS
  'Operational unit base. Real capability and service-area data are blocked by D-05; local rows are synthetic.';

-- ============================================================
-- Map base tables. Approval/version workflow remains T06.
-- ============================================================
CREATE TABLE IF NOT EXISTS map.layers (
  layer_id    UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  layer_key   TEXT        NOT NULL UNIQUE
                          CHECK (layer_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  layer_name  TEXT        NOT NULL,
  layer_type  TEXT        NOT NULL CHECK (layer_type IN ('POINT', 'LINE', 'POLYGON')),
  description TEXT,
  is_public   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS map.features (
  feature_id    UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  layer_id      UUID        NOT NULL REFERENCES map.layers(layer_id),
  version_id    UUID        NOT NULL DEFAULT public.uuid_generate_v4(),
  geom          GEOMETRY(Geometry, 4326) NOT NULL,
  properties    JSONB       NOT NULL DEFAULT '{}',
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to      TIMESTAMPTZ,
  publish_state TEXT        NOT NULL DEFAULT 'PUBLISHED'
                              CHECK (publish_state IN (
                                'DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED',
                                'EXPIRED', 'WITHDRAWN', 'ARCHIVED'
                              )),
  created_by    TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT map_feature_validity_order CHECK (
    valid_to IS NULL OR valid_to > valid_from
  ),
  CONSTRAINT map_feature_geometry_valid CHECK (ST_IsValid(geom))
);

CREATE INDEX IF NOT EXISTS map_features_geom_idx
  ON map.features USING GIST (geom);
CREATE INDEX IF NOT EXISTS map_features_layer_state_idx
  ON map.features (layer_id, publish_state, valid_from);
CREATE INDEX IF NOT EXISTS map_features_version_idx
  ON map.features (version_id);

-- ============================================================
-- Reliable event delivery primitives
-- ============================================================
ALTER TABLE platform.outbox
  ADD COLUMN IF NOT EXISTS event_version INTEGER,
  ADD COLUMN IF NOT EXISTS trace_id TEXT;

COMMENT ON COLUMN platform.outbox.event_version IS
  'Nullable during rolling migration; new T04 writers always set a positive version.';
COMMENT ON COLUMN platform.outbox.trace_id IS
  'Nullable during rolling migration; W3C-compatible 32-character trace identifier for new events.';

CREATE TABLE IF NOT EXISTS platform.inbox_messages (
  consumer_name TEXT        NOT NULL CHECK (length(trim(consumer_name)) BETWEEN 1 AND 100),
  message_id    UUID        NOT NULL,
  event_type    TEXT        NOT NULL CHECK (length(trim(event_type)) BETWEEN 1 AND 200),
  trace_id      TEXT        NOT NULL CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (consumer_name, message_id)
);

CREATE INDEX IF NOT EXISTS inbox_messages_processed_idx
  ON platform.inbox_messages (processed_at);

COMMENT ON TABLE platform.inbox_messages IS
  'Idempotent consumer claims. No automatic deletion is enabled while D-06 is pending.';
