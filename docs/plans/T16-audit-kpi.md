# T16 - Audit, KPI va dashboard lanh dao

## Outcome

T16A tao metric dictionary va pure trusted-event aggregator cho ba count metric
da co source event executable. Aggregator recheck leader/area scope, dedupe event
id, bucket theo ngay Asia/Ho_Chi_Minh, expose freshness va suppress small cell theo
nguong bat buoc injected. Khong co baseline/target mac dinh va khong register API/UI.

T16 tong the chi DONE khi governed baseline/target, persisted read model, audit
search/export, leader/auditor UI, completeness report va UAT duoc phe duyet/noi day.

## Source requirements

- REQ-09: audit append-only va export co audit trail.
- REQ-11: KPI co baseline va trusted measurement source.
- T16 source: metric name/unit/source/dimensions/owner, event reconciliation,
  small-cohort suppression, reason/hash export, governed baseline/target.
- ADR-001: analytics la module trong modular monolith, khong deploy service moi.
- ADR-004: analytics khong doc privacy vault hay identity link.
- Authorization policy: chi `leader_viewer` co `analytics.read`; area bat buoc.

## Current state

- Audit table append-only va nhieu core flow da ghi action/outcome/trace metadata.
- Incident/report lifecycle da co strict privacy-safe events va outbox/inbox.
- Chua co metric dictionary, analytics module/read model, suppression policy,
  audit query/export API hoac leader dashboard.

## Decisions and blockers

- D-04/D-05 PENDING: khong tinh SLA/dispatch KPI hoac real service area.
- D-06/D-07 PENDING: khong retention, privacy join hay unmask KPI/audit workflow.
- D-09 PENDING: small-cell threshold va query/load bounds khong co production
  default; T16A config bat buoc injected trong application call.
- D-10 PENDING: khong tuyen bo dashboard/audit export dat cap do ATTT.
- Baseline/target de `GOVERNED_UNSET`; khong them config value gia.

## Change map

| Area      | Files                                | Change                               | Risk                         |
| --------- | ------------------------------------ | ------------------------------------ | ---------------------------- |
| Contracts | incident event schema                | exact trusted source event           | source drift                 |
| API       | `modules/analytics`                  | dictionary + pure scoped aggregation | cross-area/small-cell leak   |
| Tests     | analytics unit + contract            | reconcile/timezone/scope/suppression | fake target mistaken policy  |
| Docs      | KPI dictionary, plan, README/HANDOFF | provenance/freshness/blockers        | overclaim dashboard complete |

## Implementation sequence

1. Export exact incident-received event schema used by trusted metrics.
2. Define immutable metrics with name/unit/source/dimensions/owner and explicitly
   unset governed target.
3. Implement event parser, version/source checks, duplicate conflict detection,
   area authorization, Asia/Ho_Chi_Minh day buckets and injected suppression.
4. Test reconciliation, at-least-once dedupe, UTC day boundary, cross-area/role
   denial, malformed source and small-cell redaction.
5. Run full gates, security review and record CI evidence.

## Test plan

- Unit: all three metric projections, version/source mismatch, duplicate conflict.
- Authorization-negative: missing/wrong role/cross-area scope all deny.
- Time: 16:59:59Z vs 17:00:00Z cross local-day boundary.
- Privacy: value is null below explicit threshold; no event/aggregate/principal ID.
- Contract: exact incident event data; existing report events reused.
- Integration/E2E: deferred because T16A adds no route, migration or UI.

## Rollout and rollback

- No feature flag/runtime registration; code cannot serve a dashboard.
- No migration. Future read model must be expand-only and recomputable from trusted
  state/outbox records, not queue delivery count.
- Rollback T16A files only; existing audit/events remain untouched.

## Definition of done

- [x] Metric dictionary has unit/source/dimensions/owner and no invented target.
- [x] Exact event reconciliation/dedupe/timezone behavior is deterministic.
- [x] Leader area scope and small-cell suppression fail closed.
- [x] Output exposes data freshness without event IDs or identity.
- [ ] Full local gates/CI pass; T16B blockers remain explicit.

## Progress log

- [x] 2026-08-19: source/current-state/decision review and T16A boundary complete.
- [x] 2026-08-19: T16A implementation and full local verification complete.
- [ ] Publish implementation and record green CI evidence.

## Handoff

- Changed files: incident event contract/OpenAPI, analytics dictionary/aggregator/
  tests, KPI dictionary and deterministic map integration fixtures.
- Tests run/results: analytics 9/9, contracts 30/30, API unit 90/90, worker unit
  25/25, API integration 70/70, worker integration 9/9; full local gates and clean
  Linux Node 20 coverage 19/19 workspace tasks pass.
- Remaining risks: persisted read model, governed thresholds/targets, audit export,
  completeness report, dashboard and UAT.
- Rollback: no runtime/data change; revert T16A foundation files.
