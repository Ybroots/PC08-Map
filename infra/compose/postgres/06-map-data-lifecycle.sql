-- ============================================================
-- T06 Map data lifecycle: executable, versioned map contracts
-- Expand-only migration. No retention or automatic deletion.
-- ============================================================

\connect atgt_dev

CREATE TABLE IF NOT EXISTS map.layer_schemas (
  layer_id       UUID        NOT NULL REFERENCES map.layers(layer_id),
  schema_version INTEGER     NOT NULL CHECK (schema_version > 0),
  geometry_type  TEXT        NOT NULL CHECK (geometry_type IN ('POINT', 'LINE', 'POLYGON')),
  schema_json    JSONB       NOT NULL CHECK (jsonb_typeof(schema_json) = 'object'),
  is_active      BOOLEAN     NOT NULL DEFAULT false,
  created_by     TEXT        NOT NULL CHECK (length(trim(created_by)) BETWEEN 1 AND 200),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (layer_id, schema_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS map_one_active_schema_per_layer_idx
  ON map.layer_schemas (layer_id) WHERE is_active;

INSERT INTO map.layer_schemas
  (layer_id, schema_version, geometry_type, schema_json, is_active, created_by)
SELECT layer_id, 1, layer_type, '{"type":"object","additionalProperties":true}'::jsonb,
       true, 't06-migration'
FROM map.layers
ON CONFLICT (layer_id, schema_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS map.layer_versions (
  version_id        UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  layer_id          UUID        NOT NULL REFERENCES map.layers(layer_id),
  version_number    INTEGER     NOT NULL CHECK (version_number > 0),
  schema_version    INTEGER     NOT NULL,
  parent_version_id UUID        REFERENCES map.layer_versions(version_id),
  area_id           TEXT        NOT NULL CHECK (length(trim(area_id)) BETWEEN 1 AND 100),
  data_class        TEXT        NOT NULL CHECK (data_class IN ('public', 'internal', 'sensitive', 'restricted')),
  state             TEXT        NOT NULL DEFAULT 'DRAFT' CHECK (state IN (
                                'DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED',
                                'EXPIRED', 'WITHDRAWN', 'ARCHIVED')),
  valid_from        TIMESTAMPTZ NOT NULL,
  valid_to          TIMESTAMPTZ,
  change_summary    JSONB       NOT NULL DEFAULT '{"added":0,"updated":0,"removed":0}'::jsonb,
  created_by        TEXT        NOT NULL CHECK (length(trim(created_by)) BETWEEN 1 AND 200),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by      TEXT,
  submitted_at      TIMESTAMPTZ,
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  expired_at        TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  CONSTRAINT map_layer_version_number_unique UNIQUE (layer_id, version_number),
  CONSTRAINT map_layer_version_schema_fk FOREIGN KEY (layer_id, schema_version)
    REFERENCES map.layer_schemas(layer_id, schema_version),
  CONSTRAINT map_layer_version_validity_order CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT map_layer_version_maker_checker CHECK (
    approved_by IS NULL OR submitted_by IS NULL OR approved_by <> submitted_by
  )
);

CREATE INDEX IF NOT EXISTS map_versions_public_clock_idx
  ON map.layer_versions (layer_id, state, valid_from, valid_to)
  WHERE data_class = 'public';
CREATE INDEX IF NOT EXISTS map_versions_area_state_idx
  ON map.layer_versions (area_id, state, created_at DESC);

-- Preserve any T04 rows as immutable legacy versions before adding the FK.
INSERT INTO map.layer_versions
  (version_id, layer_id, version_number, schema_version, area_id, data_class,
   state, valid_from, valid_to, created_by, created_at, submitted_by,
   submitted_at, approved_by, approved_at, published_at)
SELECT f.version_id, f.layer_id,
       row_number() OVER (PARTITION BY f.layer_id ORDER BY min(f.created_at), f.version_id),
       1, '__legacy_unscoped__', CASE WHEN l.is_public THEN 'public' ELSE 'internal' END,
       f.publish_state, min(f.valid_from), max(f.valid_to), min(f.created_by), min(f.created_at),
       CASE WHEN f.publish_state <> 'DRAFT' THEN min(f.created_by) END,
       CASE WHEN f.publish_state <> 'DRAFT' THEN min(f.created_at) END,
       CASE WHEN f.publish_state IN ('APPROVED','PUBLISHED','EXPIRED','WITHDRAWN','ARCHIVED') THEN 't06-migration' END,
       CASE WHEN f.publish_state IN ('APPROVED','PUBLISHED','EXPIRED','WITHDRAWN','ARCHIVED') THEN min(f.created_at) END,
       CASE WHEN f.publish_state IN ('PUBLISHED','EXPIRED','WITHDRAWN','ARCHIVED') THEN min(f.created_at) END
FROM map.features f
JOIN map.layers l ON l.layer_id = f.layer_id
GROUP BY f.version_id, f.layer_id, f.publish_state, l.is_public
ON CONFLICT (version_id) DO NOTHING;

ALTER TABLE map.features ADD COLUMN IF NOT EXISTS feature_key TEXT;
UPDATE map.features SET feature_key = feature_id::text WHERE feature_key IS NULL;
ALTER TABLE map.features ALTER COLUMN feature_key SET NOT NULL;
ALTER TABLE map.features ADD CONSTRAINT map_feature_key_format
  CHECK (feature_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
ALTER TABLE map.features ADD CONSTRAINT map_feature_version_fk
  FOREIGN KEY (version_id) REFERENCES map.layer_versions(version_id);
ALTER TABLE map.features ADD CONSTRAINT map_feature_version_key_unique
  UNIQUE (version_id, feature_key);

CREATE TABLE IF NOT EXISTS map.approvals (
  approval_id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  version_id  UUID        NOT NULL REFERENCES map.layer_versions(version_id),
  decision    TEXT        NOT NULL CHECK (decision = 'APPROVED'),
  actor_ref   TEXT        NOT NULL CHECK (length(trim(actor_ref)) BETWEEN 1 AND 200),
  trace_id    TEXT        NOT NULL CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  decided_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS map.version_transitions (
  transition_id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  version_id    UUID        NOT NULL REFERENCES map.layer_versions(version_id),
  from_state    TEXT,
  to_state      TEXT        NOT NULL,
  actor_ref     TEXT        NOT NULL CHECK (length(trim(actor_ref)) BETWEEN 1 AND 200),
  reason        TEXT,
  trace_id      TEXT        NOT NULL CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  happened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS map_version_transitions_timeline_idx
  ON map.version_transitions (version_id, happened_at);
REVOKE UPDATE, DELETE, TRUNCATE ON map.approvals, map.version_transitions FROM atgt_app;

CREATE OR REPLACE FUNCTION map.assert_feature_matches_version()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_type TEXT;
DECLARE owning_layer UUID;
BEGIN
  SELECT v.layer_id, s.geometry_type INTO owning_layer, expected_type
    FROM map.layer_versions v
    JOIN map.layer_schemas s ON s.layer_id = v.layer_id AND s.schema_version = v.schema_version
   WHERE v.version_id = NEW.version_id;
  IF owning_layer IS NULL OR owning_layer <> NEW.layer_id THEN
    RAISE EXCEPTION 'feature layer/version mismatch' USING ERRCODE = '23514';
  END IF;
  IF geometrytype(NEW.geom) <> (CASE expected_type
      WHEN 'POINT' THEN 'POINT' WHEN 'LINE' THEN 'LINESTRING' WHEN 'POLYGON' THEN 'POLYGON' END) THEN
    RAISE EXCEPTION 'feature geometry type does not match layer schema' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION map.protect_submitted_feature_content()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_state TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT state INTO version_state FROM map.layer_versions WHERE version_id = NEW.version_id;
    IF version_state <> 'DRAFT' THEN
      RAISE EXCEPTION 'submitted map version content is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    SELECT state INTO version_state FROM map.layer_versions WHERE version_id = OLD.version_id;
    IF version_state <> 'DRAFT' THEN
      RAISE EXCEPTION 'submitted map version content is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  SELECT state INTO version_state FROM map.layer_versions WHERE version_id = OLD.version_id;
  IF version_state <> 'DRAFT' AND (
    NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.layer_id IS DISTINCT FROM OLD.layer_id OR
    NEW.feature_key IS DISTINCT FROM OLD.feature_key OR NEW.geom IS DISTINCT FROM OLD.geom OR
    NEW.properties IS DISTINCT FROM OLD.properties OR NEW.valid_from IS DISTINCT FROM OLD.valid_from OR
    NEW.valid_to IS DISTINCT FROM OLD.valid_to
  ) THEN
    RAISE EXCEPTION 'submitted map version content is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION map.protect_submitted_version_content()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> 'DRAFT' AND (
    NEW.layer_id IS DISTINCT FROM OLD.layer_id OR
    NEW.version_number IS DISTINCT FROM OLD.version_number OR
    NEW.schema_version IS DISTINCT FROM OLD.schema_version OR
    NEW.parent_version_id IS DISTINCT FROM OLD.parent_version_id OR
    NEW.area_id IS DISTINCT FROM OLD.area_id OR
    NEW.data_class IS DISTINCT FROM OLD.data_class OR
    NEW.valid_from IS DISTINCT FROM OLD.valid_from OR
    NEW.valid_to IS DISTINCT FROM OLD.valid_to OR
    NEW.change_summary IS DISTINCT FROM OLD.change_summary OR
    NEW.created_by IS DISTINCT FROM OLD.created_by OR
    NEW.created_at IS DISTINCT FROM OLD.created_at OR
    NEW.submitted_by IS DISTINCT FROM OLD.submitted_by OR
    NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
  ) THEN
    RAISE EXCEPTION 'submitted map version metadata is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS map_feature_matches_version ON map.features;
CREATE TRIGGER map_feature_matches_version BEFORE INSERT OR UPDATE ON map.features
  FOR EACH ROW EXECUTE FUNCTION map.assert_feature_matches_version();
DROP TRIGGER IF EXISTS map_feature_content_immutable ON map.features;
CREATE TRIGGER map_feature_content_immutable BEFORE INSERT OR UPDATE OR DELETE ON map.features
  FOR EACH ROW EXECUTE FUNCTION map.protect_submitted_feature_content();
DROP TRIGGER IF EXISTS map_version_content_immutable ON map.layer_versions;
CREATE TRIGGER map_version_content_immutable BEFORE UPDATE ON map.layer_versions
  FOR EACH ROW EXECUTE FUNCTION map.protect_submitted_version_content();

COMMENT ON TABLE map.layer_versions IS 'T06 maker-checker aggregate. No automatic deletion while D-06 is pending.';
COMMENT ON TABLE map.layer_schemas IS 'Versioned JSON Schema registry used by import preview and writes.';
COMMENT ON TABLE map.approvals IS 'Append-only maker-checker decisions.';
COMMENT ON TABLE map.version_transitions IS 'Append-only lifecycle history.';
