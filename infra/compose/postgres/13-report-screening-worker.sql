-- ============================================================
-- T11B2B1 local report screening worker support (expand-only)
-- ============================================================

\connect atgt_dev

CREATE INDEX IF NOT EXISTS evidence_report_sha256_owner_idx
  ON evidence.objects (sha256, owner_id)
  WHERE owner_type = 'report' AND owner_id IS NOT NULL;

COMMENT ON INDEX evidence.evidence_report_sha256_owner_idx IS
  'Exact SHA-256 report evidence lookup only; no time, space, plate or fuzzy threshold is encoded.';
