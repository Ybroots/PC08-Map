-- ============================================================
-- T10A evidence chain-of-custody foundation (expand-only)
-- ============================================================

\connect atgt_dev

CREATE TABLE IF NOT EXISTS evidence.uploads (
  upload_id               UUID        PRIMARY KEY,
  capability_hash         CHAR(64)    NOT NULL
                                      CHECK (capability_hash ~ '^[0-9a-f]{64}$'),
  quarantine_object_key   TEXT        NOT NULL UNIQUE
                                      CHECK (
                                        length(quarantine_object_key) BETWEEN 16 AND 500
                                        AND quarantine_object_key NOT LIKE '/%'
                                        AND quarantine_object_key NOT LIKE '%..%'
                                      ),
  declared_sha256         CHAR(64)    NOT NULL
                                      CHECK (declared_sha256 ~ '^[0-9a-f]{64}$'),
  declared_mime           TEXT        NOT NULL
                                      CHECK (
                                        declared_mime = lower(declared_mime)
                                        AND declared_mime ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'
                                      ),
  declared_size_bytes     BIGINT      NOT NULL CHECK (declared_size_bytes > 0),
  state                   TEXT        NOT NULL DEFAULT 'INITIATED'
                                      CHECK (state IN (
                                        'INITIATED', 'SCAN_PENDING', 'READY', 'REJECTED'
                                      )),
  observed_sha256         CHAR(64)    CHECK (
                                        observed_sha256 IS NULL
                                        OR observed_sha256 ~ '^[0-9a-f]{64}$'
                                      ),
  rejection_code          TEXT        CHECK (
                                        rejection_code IS NULL
                                        OR rejection_code ~ '^[A-Z][A-Z0-9_]{1,63}$'
                                      ),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at              TIMESTAMPTZ NOT NULL,
  finalized_at            TIMESTAMPTZ,
  processed_at            TIMESTAMPTZ,
  CONSTRAINT evidence_upload_clock CHECK (
    expires_at > created_at
    AND (finalized_at IS NULL OR finalized_at >= created_at)
    AND (processed_at IS NULL OR processed_at >= COALESCE(finalized_at, created_at))
  ),
  CONSTRAINT evidence_upload_state_facts CHECK (
    (state = 'INITIATED'
      AND observed_sha256 IS NULL AND rejection_code IS NULL
      AND finalized_at IS NULL AND processed_at IS NULL)
    OR
    (state = 'SCAN_PENDING'
      AND observed_sha256 = declared_sha256 AND rejection_code IS NULL
      AND finalized_at IS NOT NULL AND processed_at IS NULL)
    OR
    (state = 'READY'
      AND observed_sha256 = declared_sha256 AND rejection_code IS NULL
      AND finalized_at IS NOT NULL AND processed_at IS NOT NULL)
    OR
    (state = 'REJECTED'
      AND observed_sha256 IS NOT NULL AND rejection_code IS NOT NULL
      AND finalized_at IS NOT NULL AND processed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS evidence_uploads_pending_idx
  ON evidence.uploads (finalized_at, upload_id)
  WHERE state = 'SCAN_PENDING';

CREATE TABLE IF NOT EXISTS evidence.objects (
  evidence_id             UUID        PRIMARY KEY
                                      REFERENCES evidence.uploads(upload_id),
  owner_type              TEXT        CHECK (
                                        owner_type IS NULL
                                        OR owner_type IN ('incident', 'report')
                                      ),
  owner_id                UUID,
  area_id                 TEXT        CHECK (
                                        area_id IS NULL
                                        OR length(trim(area_id)) BETWEEN 1 AND 100
                                      ),
  data_class              TEXT        NOT NULL DEFAULT 'sensitive'
                                      CHECK (data_class IN ('sensitive', 'restricted')),
  original_object_key     TEXT        NOT NULL UNIQUE,
  derivative_object_key   TEXT        NOT NULL UNIQUE,
  sha256                  CHAR(64)    NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime                    TEXT        NOT NULL,
  size_bytes              BIGINT      NOT NULL CHECK (size_bytes > 0),
  scan_engine             TEXT        NOT NULL CHECK (length(trim(scan_engine)) > 0),
  scan_engine_version     TEXT        NOT NULL CHECK (length(trim(scan_engine_version)) > 0),
  retention_policy_version TEXT       NOT NULL DEFAULT 'PENDING',
  legal_hold              BOOLEAN     NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT evidence_owner_pair CHECK (
    (owner_type IS NULL AND owner_id IS NULL AND area_id IS NULL)
    OR
    (owner_type IS NOT NULL AND owner_id IS NOT NULL AND area_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS evidence_objects_owner_idx
  ON evidence.objects (owner_type, owner_id)
  WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS evidence_objects_area_idx
  ON evidence.objects (area_id, created_at DESC)
  WHERE area_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS evidence.scan_history (
  history_id          UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  evidence_id         UUID        NOT NULL REFERENCES evidence.uploads(upload_id),
  from_state          TEXT        CHECK (
                                    from_state IS NULL
                                    OR from_state IN (
                                      'INITIATED', 'SCAN_PENDING', 'READY', 'REJECTED'
                                    )
                                  ),
  to_state            TEXT        NOT NULL CHECK (
                                    to_state IN (
                                      'INITIATED', 'SCAN_PENDING', 'READY', 'REJECTED'
                                    )
                                  ),
  outcome_code        TEXT        NOT NULL
                                  CHECK (outcome_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  scan_engine         TEXT,
  scan_engine_version TEXT,
  trace_id            TEXT        NOT NULL CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_scan_history_idx
  ON evidence.scan_history (evidence_id, created_at, history_id);

CREATE OR REPLACE FUNCTION evidence.protect_upload_declaration()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.upload_id IS DISTINCT FROM OLD.upload_id
     OR NEW.capability_hash IS DISTINCT FROM OLD.capability_hash
     OR NEW.quarantine_object_key IS DISTINCT FROM OLD.quarantine_object_key
     OR NEW.declared_sha256 IS DISTINCT FROM OLD.declared_sha256
     OR NEW.declared_mime IS DISTINCT FROM OLD.declared_mime
     OR NEW.declared_size_bytes IS DISTINCT FROM OLD.declared_size_bytes
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'evidence upload declaration is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
       (OLD.state = 'INITIATED' AND NEW.state = 'SCAN_PENDING')
       OR
       (OLD.state = 'SCAN_PENDING' AND NEW.state IN ('READY', 'REJECTED'))
     ) THEN
    RAISE EXCEPTION 'invalid evidence state transition'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidence_uploads_protect_declaration
  ON evidence.uploads;
CREATE TRIGGER evidence_uploads_protect_declaration
BEFORE UPDATE ON evidence.uploads
FOR EACH ROW EXECUTE FUNCTION evidence.protect_upload_declaration();

CREATE OR REPLACE FUNCTION evidence.protect_object_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.evidence_id IS DISTINCT FROM OLD.evidence_id
     OR NEW.original_object_key IS DISTINCT FROM OLD.original_object_key
     OR NEW.derivative_object_key IS DISTINCT FROM OLD.derivative_object_key
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.mime IS DISTINCT FROM OLD.mime
     OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
     OR NEW.scan_engine IS DISTINCT FROM OLD.scan_engine
     OR NEW.scan_engine_version IS DISTINCT FROM OLD.scan_engine_version
     OR NEW.retention_policy_version IS DISTINCT FROM OLD.retention_policy_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'evidence object integrity fields are immutable'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.owner_id IS NOT NULL AND (
       NEW.owner_type IS DISTINCT FROM OLD.owner_type
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.area_id IS DISTINCT FROM OLD.area_id
     ) THEN
    RAISE EXCEPTION 'evidence ownership cannot be reassigned'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidence_objects_protect_integrity
  ON evidence.objects;
CREATE TRIGGER evidence_objects_protect_integrity
BEFORE UPDATE ON evidence.objects
FOR EACH ROW EXECUTE FUNCTION evidence.protect_object_integrity();

CREATE OR REPLACE FUNCTION evidence.validate_ready_object()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  upload evidence.uploads%ROWTYPE;
BEGIN
  SELECT * INTO upload
    FROM evidence.uploads
   WHERE upload_id = NEW.evidence_id;
  IF upload.state <> 'READY'
     OR NEW.sha256 <> upload.declared_sha256
     OR NEW.mime <> upload.declared_mime
     OR NEW.size_bytes <> upload.declared_size_bytes THEN
    RAISE EXCEPTION 'evidence object does not match a READY upload'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidence_objects_validate_ready
  ON evidence.objects;
CREATE TRIGGER evidence_objects_validate_ready
BEFORE INSERT ON evidence.objects
FOR EACH ROW EXECUTE FUNCTION evidence.validate_ready_object();

REVOKE DELETE, TRUNCATE ON evidence.uploads FROM atgt_app;
REVOKE DELETE, TRUNCATE ON evidence.objects FROM atgt_app;
REVOKE UPDATE, DELETE, TRUNCATE ON evidence.scan_history FROM atgt_app;

COMMENT ON TABLE evidence.uploads IS
  'Quarantine upload declarations and scan state; contains no citizen session, token, IP, account or device identity.';
COMMENT ON COLUMN evidence.uploads.capability_hash IS
  'SHA-256 of the upload capability; raw capability is never persisted.';
COMMENT ON TABLE evidence.objects IS
  'READY original/derivative chain-of-custody. Integrity fields cannot be overwritten and rows cannot be deleted by the app role.';
COMMENT ON TABLE evidence.scan_history IS
  'Append-only evidence lifecycle history with stable outcome codes and no object keys or signed URLs.';
