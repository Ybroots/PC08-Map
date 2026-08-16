-- ============================================================
-- T03 Identity tables
-- Raw bearer and citizen-session tokens are never persisted.
-- ============================================================

\connect atgt_dev

CREATE TABLE IF NOT EXISTS identity.citizen_sessions (
  session_id              UUID        PRIMARY KEY,
  token_hash              TEXT        NOT NULL UNIQUE
                                      CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  device_class            TEXT        NOT NULL
                                      CHECK (device_class IN ('mobile', 'web')),
  created_at              TIMESTAMPTZ NOT NULL,
  rotate_after            TIMESTAMPTZ NOT NULL,
  expires_at              TIMESTAMPTZ NOT NULL,
  revoked_at              TIMESTAMPTZ,
  replaced_by_session_id  UUID,
  CONSTRAINT citizen_session_time_order CHECK (
    created_at < rotate_after AND rotate_after < expires_at
  ),
  CONSTRAINT citizen_session_replacement_fk
    FOREIGN KEY (replaced_by_session_id)
    REFERENCES identity.citizen_sessions(session_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS citizen_sessions_active_expiry_idx
  ON identity.citizen_sessions (expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE identity.citizen_sessions IS
  'Anonymous citizen sessions. Contains token hashes only; no IP, device fingerprint, account ID, or PII.';

CREATE TABLE IF NOT EXISTS identity.revoked_officer_sessions (
  session_id_hash TEXT        PRIMARY KEY
                              CHECK (session_id_hash ~ '^[0-9a-f]{64}$'),
  revoked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  reason_code     TEXT        NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 64),
  CONSTRAINT revoked_session_time_order CHECK (revoked_at < expires_at)
);

CREATE INDEX IF NOT EXISTS revoked_officer_sessions_expiry_idx
  ON identity.revoked_officer_sessions (expires_at);

COMMENT ON TABLE identity.revoked_officer_sessions IS
  'Revoked OIDC sid hashes. Raw session IDs and bearer tokens are not stored.';
