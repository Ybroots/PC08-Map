# ADR-008: Deployment Orchestration

**Status**: ACCEPTED  
**Date**: 2026-08-16

## Decision

Use **Ansible + OCI containers + systemd/Docker Compose** for 09 fixed VPS deployment.

## Rationale

- Kubernetes adds significant operational overhead for a fixed-VPS MVP
- Ansible gives idempotent, auditable, version-controlled infrastructure
- OCI containers provide environment consistency
- systemd/Compose provides process supervision without k8s complexity

## Consequences

- Rolling deploy: update VPS04 → health check → update VPS05
- Worker (VPS06) drain before update
- All roles are idempotent; dry-run mode available
- Revisit for province-wide rollout if elastic scaling is needed
