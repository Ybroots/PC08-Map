-- ============================================================
-- T11B2A operator verification and duplicate override foundation
-- ============================================================

\connect atgt_dev

CREATE SEQUENCE IF NOT EXISTS report.verification_queue_sequence;

ALTER TABLE report.reports
  ADD COLUMN IF NOT EXISTS verification_sequence BIGINT;

CREATE OR REPLACE FUNCTION report.assign_verification_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.state = 'PENDING_VERIFICATION' THEN
    NEW.verification_sequence := nextval('report.verification_queue_sequence');
  ELSIF TG_OP = 'UPDATE' AND NEW.state = 'PENDING_VERIFICATION'
        AND OLD.state <> 'PENDING_VERIFICATION' THEN
    NEW.verification_sequence := nextval('report.verification_queue_sequence');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_assign_verification_sequence
  ON report.reports;
CREATE TRIGGER reports_assign_verification_sequence
BEFORE INSERT OR UPDATE OF state ON report.reports
FOR EACH ROW EXECUTE FUNCTION report.assign_verification_sequence();

UPDATE report.reports
   SET verification_sequence = nextval('report.verification_queue_sequence')
 WHERE state = 'PENDING_VERIFICATION' AND verification_sequence IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reports_verification_sequence_idx
  ON report.reports (verification_sequence)
  WHERE verification_sequence IS NOT NULL;

CREATE TABLE IF NOT EXISTS report.duplicate_candidates (
  id                  UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  report_id           UUID        NOT NULL REFERENCES report.reports(id),
  candidate_report_id UUID        NOT NULL REFERENCES report.reports(id),
  signals             TEXT[]      NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'PENDING'
                                  CHECK (status IN ('PENDING', 'CONFIRMED', 'FALSE_POSITIVE')),
  observed_at         TIMESTAMPTZ NOT NULL,
  source_ref          TEXT        NOT NULL
                                  CHECK (length(trim(source_ref)) BETWEEN 1 AND 200),
  version             INTEGER     NOT NULL DEFAULT 1 CHECK (version > 0),
  resolved_by         TEXT,
  resolution_reason   TEXT,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duplicate_candidate_distinct_reports
    CHECK (report_id <> candidate_report_id),
  CONSTRAINT duplicate_candidate_signals
    CHECK (
      cardinality(signals) BETWEEN 1 AND 4
      AND signals <@ ARRAY['TIME','SPACE','HASH','PLATE']::TEXT[]
    ),
  CONSTRAINT duplicate_candidate_resolution
    CHECK (
      (status = 'PENDING' AND resolved_by IS NULL
        AND resolution_reason IS NULL AND resolved_at IS NULL)
      OR
      (status IN ('CONFIRMED', 'FALSE_POSITIVE')
        AND length(trim(resolved_by)) BETWEEN 1 AND 200
        AND length(trim(resolution_reason)) BETWEEN 1 AND 1000
        AND resolved_at IS NOT NULL)
    ),
  UNIQUE (report_id, candidate_report_id)
);

CREATE INDEX IF NOT EXISTS duplicate_candidates_report_status_idx
  ON report.duplicate_candidates (report_id, status, created_at ASC);

CREATE OR REPLACE FUNCTION report.protect_duplicate_candidate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.report_id IS DISTINCT FROM OLD.report_id
     OR NEW.candidate_report_id IS DISTINCT FROM OLD.candidate_report_id
     OR NEW.signals IS DISTINCT FROM OLD.signals
     OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
     OR NEW.source_ref IS DISTINCT FROM OLD.source_ref
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'duplicate candidate evidence is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> 'PENDING' OR NEW.status NOT IN ('CONFIRMED', 'FALSE_POSITIVE')
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'invalid duplicate candidate resolution transition'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS duplicate_candidates_protect_resolution
  ON report.duplicate_candidates;
CREATE TRIGGER duplicate_candidates_protect_resolution
BEFORE UPDATE ON report.duplicate_candidates
FOR EACH ROW EXECUTE FUNCTION report.protect_duplicate_candidate();

REVOKE DELETE, TRUNCATE ON report.duplicate_candidates FROM atgt_app;

COMMENT ON TABLE report.duplicate_candidates IS
  'Suggestion-only duplicate signals. A scoped dispatcher must confirm or mark false-positive.';
COMMENT ON COLUMN report.duplicate_candidates.signals IS
  'Observed signal kinds only. Business thresholds remain blocked by D-09 and are not encoded here.';
COMMENT ON COLUMN report.reports.verification_sequence IS
  'Stable cursor assigned only when the report enters the area-scoped pending verification queue.';
