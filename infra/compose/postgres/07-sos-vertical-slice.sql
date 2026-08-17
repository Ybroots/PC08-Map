-- ============================================================
-- T07 SOS incident vertical slice (expand-only)
-- ============================================================

\connect atgt_dev

ALTER TABLE incident.status_history
  ADD COLUMN IF NOT EXISTS feed_sequence BIGINT GENERATED ALWAYS AS IDENTITY;

CREATE UNIQUE INDEX IF NOT EXISTS incident_status_feed_sequence_idx
  ON incident.status_history (feed_sequence);
CREATE INDEX IF NOT EXISTS incident_status_resume_idx
  ON incident.status_history (incident_id, feed_sequence);

CREATE OR REPLACE FUNCTION incident.protect_accepted_sos_payload()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.public_code IS DISTINCT FROM OLD.public_code
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.accuracy_m IS DISTINCT FROM OLD.accuracy_m
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'accepted SOS payload is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS incidents_protect_accepted_payload
  ON incident.incidents;
CREATE TRIGGER incidents_protect_accepted_payload
BEFORE UPDATE ON incident.incidents
FOR EACH ROW EXECUTE FUNCTION incident.protect_accepted_sos_payload();

COMMENT ON COLUMN incident.status_history.feed_sequence IS
  'Monotonic internal resume cursor for scoped operations feeds; never exposed on public tracking.';
COMMENT ON FUNCTION incident.protect_accepted_sos_payload() IS
  'Protects the citizen-submitted SOS payload after acknowledgement; later corrections use append-only history/notes.';
