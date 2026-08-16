# ADR-003: Dispatch Orchestration

**Status**: ACCEPTED  
**Date**: 2026-08-16

## Decision

Dispatch is **operator-confirmed by default**. Auto-assignment is only enabled when:

1. A rule version has been formally approved by the inter-agency business team
2. A feature flag for that rule version is explicitly enabled in production config

## Rationale

- Legal and operational accountability requires human in the loop
- Automated dispatch without approved rules creates liability
- SLA clock starts on assignment; escalation triggers on ack timeout

## Consequences

- Dispatcher UI always shows candidate list; operator clicks to assign
- Auto-assign code path exists but is gated by feature flag and approved rule version
- Any change to dispatch rules requires new rule version + approval + audit
