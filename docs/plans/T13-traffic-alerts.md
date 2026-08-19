# T13 - Canh bao giao thong

## Outcome

T13A cung cap projection canh bao theo bbox/vehicle tu map feature public,
PUBLISHED va con hieu luc. Response chi chua allowlisted warning/action/priority,
stable source id, version va validity. Route-aware/direction/cooldown khong duoc
tuyen bo hoan thanh trong lat cat nay.

## Source requirements

- REQ-06: chi map data da duyet/published/con hieu luc duoc public.
- REQ-07: provider quality/degraded state phai ro rang.
- ADR-001: module `alerts` nam trong modular monolith, khong import map repository.
- ADR-009: bbox/geometry EPSG:4326 `[longitude, latitude]`.
- UAT source: wrong vehicle/time, expired feature, alert fatigue, degraded route.

## Current state

- T06 da co immutable published map versions, public bbox query va scheduled expiry.
- Seed synthetic co dangerous point public voi strict nested alert projection.
- T05 real route provider van bi khoa boi D-03.

## Decisions and blockers

- D-03 PENDING: T13A khong goi route/search provider va khong goi route-aware.
- D-09 PENDING: khong dat proximity/cooldown/load defaults. Khi enable local/test,
  deployment phai truyen candidate/result technical bounds ro rang.
- Staging/production reject `TRAFFIC_ALERTS_ENABLED=true` cho den T13B gates.

## Change map

| Area       | Files                                     | Change                                     | Risk                          |
| ---------- | ----------------------------------------- | ------------------------------------------ | ----------------------------- |
| Contract   | `packages/contracts/src/alerts`, OpenAPI  | Strict bbox query and sanitized projection | Unsafe public data            |
| Config     | `packages/config`                         | Disabled-by-default local/test bounds      | Invented load defaults        |
| API        | `apps/api/src/modules/alerts`             | Independent published-map read model       | Module coupling/stale data    |
| Seed       | synthetic dangerous point properties      | Executable local warning fixture           | Fake content mistaken as real |
| Tests/docs | contract/unit/integration/runbook/HANDOFF | expiry, vehicle, invalid source, overflow  | False confidence              |

## Implementation sequence

1. Executable query/response contracts and OpenAPI.
2. Fail-closed config with explicit candidate/result bounds.
3. Alerts repository reads existing immutable map tables without importing map
   internals; current published version per eligible layer only.
4. Validate every source property before returning sanitized public output.
5. Cover vehicle/time/expired/version/source-invalid/overflow and update docs.

## Test plan

- Unit/contract: bbox order/range, vehicle enum, strict response, no arbitrary
  source properties.
- Integration: public/current/PUBLISHED only; vehicle mismatch and expiry excluded;
  invalid published source fails closed; candidate/result overflow not truncated.
- Authorization: explicit public route; disabled feature returns stable 503.
- Degraded: no provider call; projection labels source as `PUBLISHED_MAP_DATA` and
  capability as `BBOX_ONLY`.

## Rollout and rollback

- Feature flag: `TRAFFIC_ALERTS_ENABLED=false`.
- No schema migration; synthetic seed is updated and verified by cold start.
- Deploy API after contracts/config. Roll back API/config and leave map data intact.

## Definition of done

- [x] Only public/PUBLISHED/current verified source is returned.
- [x] Warning explains restriction/hazard and action; output is allowlisted.
- [x] Vehicle/time/expired/invalid-source/overflow tests pass.
- [x] Full local gates and cold start pass.
- [x] T13B route/direction/anti-repeat remains explicitly blocked.

## Progress log

- [x] Source/ADR/current-state review complete.
- [x] T13A implementation and focused tests.

## Handoff

- Changed files: contracts/OpenAPI, fail-closed config, independent alerts API
  module, synthetic seed, unit/integration tests and operator/security docs.
- Tests run/results: full frozen install, format/lint/typecheck/unit/coverage/
  contract/e2e/build pass; final cold-start pass API 70/70 + worker 9/9.
- Remaining risks: no route-aware proximity/direction/cooldown or real provider.
- Rollback: disable `TRAFFIC_ALERTS_ENABLED`; do not modify published map history.
