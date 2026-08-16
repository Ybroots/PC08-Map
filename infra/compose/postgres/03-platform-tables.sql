-- ============================================================
-- Platform tables: outbox, idempotency
-- ============================================================

\connect atgt_dev
SET search_path TO platform;

-- ============================================================
-- Transactional Outbox
-- Events written here in SAME transaction as state change.
-- Relay worker reads and publishes to RabbitMQ.
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.outbox (
  event_id        UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  aggregate_id    TEXT        NOT NULL,
  aggregate_type  TEXT        NOT NULL,
  event_type      TEXT        NOT NULL,         -- e.g. "incident.received.v1"
  payload         JSONB       NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at    TIMESTAMPTZ,                  -- NULL = pending
  publish_attempts INT        NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for relay worker: fetch pending events ordered by time
CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON platform.outbox (occurred_at ASC)
  WHERE published_at IS NULL;

COMMENT ON TABLE platform.outbox IS
  'Transactional outbox - written in same TX as state change; relay pushes to RabbitMQ';

-- ============================================================
-- Idempotency Store
-- Prevents duplicate processing of retried POST requests.
-- Key: Idempotency-Key header value (from client)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform.idempotency_keys (
  idempotency_key TEXT        PRIMARY KEY,
  request_hash    TEXT        NOT NULL,         -- SHA256 of request body
  state           TEXT        NOT NULL DEFAULT 'PROCESSING'
                               CHECK (state IN ('PROCESSING', 'COMPLETED')),
  response_status INT,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,         -- TTL: clean up old keys
  CONSTRAINT idempotency_completed_response_check CHECK (
    (state = 'PROCESSING' AND response_status IS NULL AND response_body IS NULL)
    OR
    (state = 'COMPLETED' AND response_status IS NOT NULL AND response_body IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idempotency_expires_idx
  ON platform.idempotency_keys (expires_at);

COMMENT ON TABLE platform.idempotency_keys IS
  'Idempotency store for POST requests with Idempotency-Key header';

-- ============================================================
-- Audit Log (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit.audit_events (
  id          UUID        PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  who         TEXT        NOT NULL,             -- principal_id (officer ref or 'system')
  action      TEXT        NOT NULL,             -- e.g. 'incident.view', 'evidence.download'
  object_type TEXT        NOT NULL,             -- e.g. 'incident', 'evidence'
  object_id   TEXT        NOT NULL,
  scope       TEXT,                             -- area_id or unit_id if applicable
  outcome     TEXT        NOT NULL,             -- 'SUCCESS' | 'DENIED' | 'ERROR'
  reason      TEXT,                             -- Required for sensitive actions
  trace_id    TEXT        NOT NULL,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata    JSONB
);

-- Partition-ready index; app role has INSERT+SELECT only
CREATE INDEX IF NOT EXISTS audit_who_idx        ON audit.audit_events (who, happened_at DESC);
CREATE INDEX IF NOT EXISTS audit_object_idx     ON audit.audit_events (object_type, object_id, happened_at DESC);
CREATE INDEX IF NOT EXISTS audit_action_idx     ON audit.audit_events (action, happened_at DESC);
CREATE INDEX IF NOT EXISTS audit_trace_idx      ON audit.audit_events (trace_id);

-- Protect audit table: revoke DELETE/UPDATE from atgt_app
REVOKE DELETE, UPDATE, TRUNCATE ON audit.audit_events FROM atgt_app;

COMMENT ON TABLE audit.audit_events IS
  'Append-only security/business audit - atgt_app can INSERT+SELECT only';
