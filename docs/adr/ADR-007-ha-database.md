# ADR-007: High-Availability Database

**Status**: ACCEPTED  
**Date**: 2026-08-16

## Decision

- PostgreSQL primary on VPS07, streaming replica on VPS08
- PITR via WAL archiving to backup storage (VPS09)
- **Failover is manual via runbook** (RB-05), not automatic
- Reason: 2-node setup without a reliable quorum/DCS (e.g. etcd/Consul) risks split-brain on auto-failover

## Consequences

- RTO for DB failover is longer (minutes to manual runbook completion)
- Acceptable for MVP; revisit if witness/DCS node is provisioned
- Application uses single DATABASE_URL pointing to primary; manual update on failover
