-- ============================================================
-- T10B3 evidence access-control hardening (expand-only)
-- ============================================================

\connect atgt_dev

CREATE INDEX IF NOT EXISTS evidence_objects_access_scope_idx
  ON evidence.objects (area_id, owner_id, evidence_id)
  WHERE owner_id IS NOT NULL;

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
  IF OLD.data_class = 'restricted' AND NEW.data_class <> 'restricted' THEN
    RAISE EXCEPTION 'evidence data classification cannot be downgraded'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON INDEX evidence.evidence_objects_access_scope_idx IS
  'Supports deny-by-default evidence lookup by actual area, owner case and evidence id.';
