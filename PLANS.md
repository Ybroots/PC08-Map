# Execution Plan Template (PLANS.md)

Copy this template to `docs/plans/Txx.md` for each task.

---

## Outcome

What user/operator outcome will exist after this task is complete?

## Source requirements

- Requirement IDs and source section (e.g. REQ-01, Section 2.1)
- Relevant ADRs and policies

## Current state

- Existing code paths and tests
- Constraints and known gaps

## Decisions and blockers

- Confirmed decisions (from Decision Register)
- Missing policy values; fallback/feature flag; explicit stop point

## Change map

| Area | Files | Change | Risk |
| ---- | ----- | ------ | ---- |
|      |       |        |      |

## Implementation sequence

1. Contract/migration
2. Domain invariants and policy
3. Application use case and adapters
4. API/event/client UI
5. Telemetry/audit/runbook

## Test plan

- Unit/domain
- Integration/PostGIS/queue/storage
- Contract/OpenAPI/events/provider
- E2E and authorization-negative
- Failure/degraded/rollback

## Rollout and rollback

- Feature flag/config
- Migration compatibility
- Deploy order, monitoring and abort thresholds

## Definition of done

- Acceptance criteria (from task Txx)
- Commands and expected results
- Documentation/evidence

## Progress log

- [ ] Milestone 1
- [ ] Milestone 2

## Handoff

- Changed files
- Tests run/results
- Remaining risks/assumptions
- Rollback steps
