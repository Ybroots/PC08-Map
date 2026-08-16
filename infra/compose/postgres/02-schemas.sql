-- ============================================================
-- ATGT Platform - Schema Setup
-- ============================================================
-- Each module owns its schema; cross-schema joins are forbidden
-- except through controlled views or application-layer queries.

\connect atgt_dev

-- ============================================================
-- Enable PostGIS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- for text search
CREATE EXTENSION IF NOT EXISTS btree_gist; -- for exclusion constraints

-- ============================================================
-- Module schemas (one per bounded context)
-- ============================================================
CREATE SCHEMA IF NOT EXISTS incident   AUTHORIZATION atgt_app;
CREATE SCHEMA IF NOT EXISTS dispatch   AUTHORIZATION atgt_app;
CREATE SCHEMA IF NOT EXISTS report     AUTHORIZATION atgt_app;
CREATE SCHEMA IF NOT EXISTS evidence   AUTHORIZATION atgt_app;
CREATE SCHEMA IF NOT EXISTS map        AUTHORIZATION atgt_app;
CREATE SCHEMA IF NOT EXISTS integration AUTHORIZATION atgt_app;
CREATE SCHEMA IF NOT EXISTS platform   AUTHORIZATION atgt_app;
CREATE SCHEMA IF NOT EXISTS analytics  AUTHORIZATION atgt_app;

-- Audit schema: app can INSERT only; no UPDATE/DELETE
CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION atgt_migration;

-- Privacy vault: separate role; app has NO direct access
CREATE SCHEMA IF NOT EXISTS privacy AUTHORIZATION atgt_privacy;

-- ============================================================
-- Grant privileges
-- ============================================================

-- atgt_app: full access to module schemas
GRANT USAGE ON SCHEMA incident, dispatch, report, evidence, map, integration, platform, analytics TO atgt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA incident, dispatch, report, evidence, map, integration, platform, analytics
  GRANT ALL ON TABLES TO atgt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA incident, dispatch, report, evidence, map, integration, platform, analytics
  GRANT ALL ON SEQUENCES TO atgt_app;

-- atgt_app: INSERT only on audit (not UPDATE/DELETE)
GRANT USAGE ON SCHEMA audit TO atgt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT INSERT, SELECT ON TABLES TO atgt_app;

-- atgt_audit: read-only on audit schema
GRANT USAGE ON SCHEMA audit TO atgt_audit;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT SELECT ON TABLES TO atgt_audit;
GRANT atgt_audit TO atgt_app;   -- atgt_app can read audit but cannot modify

-- atgt_privacy: full access to privacy schema only
GRANT USAGE ON SCHEMA privacy TO atgt_privacy;
ALTER DEFAULT PRIVILEGES IN SCHEMA privacy GRANT ALL ON TABLES TO atgt_privacy;
ALTER DEFAULT PRIVILEGES IN SCHEMA privacy GRANT ALL ON SEQUENCES TO atgt_privacy;

-- atgt_migration: can run DDL (CREATE TABLE etc.)
GRANT ALL ON SCHEMA incident, dispatch, report, evidence, map, integration, platform, analytics, audit TO atgt_migration;
GRANT ALL PRIVILEGES ON DATABASE atgt_dev TO atgt_migration;

-- ============================================================
-- Schema comments (documentation)
-- ============================================================
COMMENT ON SCHEMA incident    IS 'SOS/CNCH incidents, state machine, status history';
COMMENT ON SCHEMA dispatch    IS 'Units, assignments, SLA tracking - NOT public';
COMMENT ON SCHEMA report      IS 'Citizen violation reports - PII-free business table';
COMMENT ON SCHEMA evidence    IS 'File upload pipeline: quarantine, scan, original, derivative';
COMMENT ON SCHEMA map         IS 'Spatial layers, features, versions, approvals';
COMMENT ON SCHEMA integration IS 'Provider usage metrics (VietMap quota, antivirus)';
COMMENT ON SCHEMA platform    IS 'Transactional outbox, idempotency store';
COMMENT ON SCHEMA analytics   IS 'Anonymized KPI aggregations and metric snapshots';
COMMENT ON SCHEMA audit       IS 'Append-only security/business audit log - app CANNOT modify';
COMMENT ON SCHEMA privacy     IS 'Privacy vault: identity linkage - RESTRICTED ACCESS - separate role';
