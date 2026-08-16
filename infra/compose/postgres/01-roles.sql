-- ============================================================
-- ATGT Platform - PostgreSQL Role Setup (local dev)
-- ============================================================
-- Role hierarchy:
--   postgres (superuser)
--   └── atgt_app       (main app role: incidents, dispatch, reports, etc.)
--       └── atgt_audit (audit read-only: cannot UPDATE/DELETE audit.*)
--   atgt_privacy       (privacy vault - separate access path)
--   atgt_migration     (runs migrations)

-- App user (API + Worker processes)
CREATE USER atgt_app WITH PASSWORD 'devpassword_local' LOGIN;

-- Privacy vault user (separate role, separate key in production)
CREATE USER atgt_privacy WITH PASSWORD 'devpassword_local' LOGIN;

-- Migration user (runs schema migrations)
CREATE USER atgt_migration WITH PASSWORD 'devpassword_local' LOGIN CREATEROLE;

-- Audit role (no login, granted to atgt_app for read; cannot write)
CREATE ROLE atgt_audit NOLOGIN;
