-- ============================================================
-- T11A anonymous citizen report intake (expand-only)
-- ============================================================

\connect atgt_dev

CREATE TABLE IF NOT EXISTS report.category_catalog (
  code        TEXT    PRIMARY KEY
                      CHECK (code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  label_vi    TEXT    NOT NULL CHECK (length(trim(label_vi)) > 0),
  label_en    TEXT    NOT NULL CHECK (length(trim(label_en)) > 0),
  enabled     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS report.reports (
  id                      UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  public_code             CHAR(12)    NOT NULL UNIQUE
                                      CHECK (public_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$'),
  category_code           TEXT        NOT NULL REFERENCES report.category_catalog(code),
  longitude               DOUBLE PRECISION NOT NULL
                                      CHECK (longitude BETWEEN -180 AND 180),
  latitude                DOUBLE PRECISION NOT NULL
                                      CHECK (latitude BETWEEN -90 AND 90),
  geom                    GEOGRAPHY(Point, 4326)
                          GENERATED ALWAYS AS (
                            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
                          ) STORED,
  description             TEXT        NOT NULL
                                      CHECK (length(description) BETWEEN 1 AND 1000),
  plate_text_unverified   TEXT
                                      CHECK (
                                        plate_text_unverified IS NULL OR
                                        length(plate_text_unverified) BETWEEN 1 AND 32
                                      ),
  reported_at             TIMESTAMPTZ NOT NULL,
  state                   TEXT        NOT NULL DEFAULT 'RECEIVED'
                                      CHECK (state IN (
                                        'RECEIVED', 'SCREENING',
                                        'PENDING_VERIFICATION', 'VERIFIED',
                                        'REJECTED', 'DUPLICATE', 'IN_PROCESS',
                                        'RESOLVED', 'CLOSED', 'ARCHIVED'
                                      )),
  risk_score              NUMERIC(5,4)
                                      CHECK (
                                        risk_score IS NULL OR
                                        risk_score BETWEEN 0 AND 1
                                      ),
  area_id                 TEXT        NOT NULL
                                      CHECK (length(trim(area_id)) BETWEEN 1 AND 100),
  data_class              TEXT        NOT NULL DEFAULT 'sensitive'
                                      CHECK (data_class = 'sensitive'),
  version                 INTEGER     NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS reports_geom_idx
  ON report.reports USING GIST (geom);
CREATE INDEX IF NOT EXISTS reports_area_state_created_idx
  ON report.reports (area_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_pending_verification_idx
  ON report.reports (area_id, created_at ASC)
  WHERE state = 'PENDING_VERIFICATION';

CREATE TABLE IF NOT EXISTS report.status_history (
  id            UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  report_id     UUID        NOT NULL REFERENCES report.reports(id),
  from_state    TEXT        CHECK (
                              from_state IS NULL OR from_state IN (
                                'RECEIVED', 'SCREENING',
                                'PENDING_VERIFICATION', 'VERIFIED',
                                'REJECTED', 'DUPLICATE', 'IN_PROCESS',
                                'RESOLVED', 'CLOSED', 'ARCHIVED'
                              )
                            ),
  to_state      TEXT        NOT NULL CHECK (
                              to_state IN (
                                'RECEIVED', 'SCREENING',
                                'PENDING_VERIFICATION', 'VERIFIED',
                                'REJECTED', 'DUPLICATE', 'IN_PROCESS',
                                'RESOLVED', 'CLOSED', 'ARCHIVED'
                              )
                            ),
  actor_ref     TEXT        NOT NULL
                            CHECK (length(trim(actor_ref)) BETWEEN 1 AND 200),
  reason        TEXT,
  trace_id      TEXT        NOT NULL CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_status_history_idx
  ON report.status_history (report_id, created_at ASC);

CREATE OR REPLACE FUNCTION report.protect_submitted_payload()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.public_code IS DISTINCT FROM OLD.public_code
     OR NEW.category_code IS DISTINCT FROM OLD.category_code
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.plate_text_unverified IS DISTINCT FROM OLD.plate_text_unverified
     OR NEW.reported_at IS DISTINCT FROM OLD.reported_at
     OR NEW.area_id IS DISTINCT FROM OLD.area_id
     OR NEW.data_class IS DISTINCT FROM OLD.data_class THEN
    RAISE EXCEPTION 'submitted citizen report payload is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_protect_submitted_payload
  ON report.reports;
CREATE TRIGGER reports_protect_submitted_payload
BEFORE UPDATE ON report.reports
FOR EACH ROW EXECUTE FUNCTION report.protect_submitted_payload();

REVOKE DELETE, TRUNCATE ON report.reports FROM atgt_app;
REVOKE UPDATE, DELETE, TRUNCATE ON report.status_history FROM atgt_app;

COMMENT ON TABLE report.reports IS
  'PII-free citizen report business records. Session, IP, device, account and token identity are forbidden.';
COMMENT ON COLUMN report.reports.plate_text_unverified IS
  'Citizen-provided plate text; never verified and never an enforcement decision.';
COMMENT ON COLUMN report.reports.risk_score IS
  'Reserved for approved T11B screening. T11A intake always stores NULL.';
COMMENT ON TABLE report.status_history IS
  'Append-only report lifecycle history; application role cannot update or delete rows.';
COMMENT ON FUNCTION report.protect_submitted_payload() IS
  'Protects acknowledged citizen input; corrections must be modeled as explicit audited records.';
