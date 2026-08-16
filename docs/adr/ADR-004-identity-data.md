# ADR-004: Identity Data Architecture

**Status**: ACCEPTED  
**Date**: 2026-08-16

## Decision

- Business tables (`report.reports`, `incident.incidents`) contain NO citizen technical identity (IP, device fingerprint, account ID).
- Minimal technical identity linkage, if legally permitted to collect, lives in `privacy.identity_links` with a separate DB role and encryption key.
- No default JOINs between business schema and privacy vault.

## Consequences

- Requires break-glass workflow to link business record to identity
- Privacy vault schema uses separate PostgreSQL role (`atgt_privacy`) with row-level encryption
- All vault access is audited and subject to two-person approval
