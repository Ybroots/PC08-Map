-- ============================================================
-- T11B1 READY evidence ownership/linking foundation (expand-only)
-- ============================================================

\connect atgt_dev

CREATE OR REPLACE FUNCTION evidence.attach_ready_to_report(
  target_evidence_id UUID,
  target_report_id UUID,
  target_area_id TEXT,
  supplied_capability_hash CHAR(64)
)
RETURNS TABLE(attached_now BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, evidence, report
AS $$
DECLARE
  current_owner_type TEXT;
  current_owner_id UUID;
  current_area_id TEXT;
BEGIN
  PERFORM 1
    FROM report.reports r
   WHERE r.id = target_report_id
     AND r.area_id = target_area_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT o.owner_type, o.owner_id, o.area_id
    INTO current_owner_type, current_owner_id, current_area_id
    FROM evidence.objects o
    JOIN evidence.uploads u ON u.upload_id = o.evidence_id
   WHERE o.evidence_id = target_evidence_id
     AND u.state = 'READY'
     AND u.capability_hash = supplied_capability_hash
   FOR UPDATE OF o, u;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF current_owner_id IS NULL THEN
    UPDATE evidence.objects
       SET owner_type = 'report',
           owner_id = target_report_id,
           area_id = target_area_id
     WHERE evidence_id = target_evidence_id;
    RETURN QUERY SELECT true;
    RETURN;
  END IF;

  IF current_owner_type = 'report'
     AND current_owner_id = target_report_id
     AND current_area_id = target_area_id THEN
    RETURN QUERY SELECT false;
  END IF;
END;
$$;

REVOKE UPDATE ON evidence.objects FROM atgt_app;
GRANT UPDATE(data_class, legal_hold) ON evidence.objects TO atgt_app;
REVOKE ALL ON FUNCTION evidence.attach_ready_to_report(UUID,UUID,TEXT,CHAR)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evidence.attach_ready_to_report(UUID,UUID,TEXT,CHAR)
  TO atgt_app;

COMMENT ON FUNCTION evidence.attach_ready_to_report(UUID,UUID,TEXT,CHAR) IS
  'Atomically assigns a capability-authorized READY evidence object to one report. Existing ownership is immutable and returned as no match.';
