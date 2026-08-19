# T11 - Citizen reports va chong lam dung

## Outcome

Tao luong phan anh an danh, PII-free va co ma tra cuu ngau nhien. T11 duoc
chia nho de khong vuot cac cong production dang mo:

- T11A: intake + public tracking foundation. Citizen session submit mot report
  text/location/plate-unverified, idempotent acknowledgement, append-only
  history/audit va atomic outbox. Runtime chi duoc bat o local/test.
- T11B1: READY evidence ownership/linking voi citizen session va hai capability
  rieng biet; local/test only, production fail-closed.
- T11B2A: area-scoped operator verification queue, optimistic manual decision,
  duplicate confirm va false-positive override; khong can tu dat D-09 threshold.
- T11B2B1: local/test screening worker va exact-SHA suggestion, khong co fuzzy
  threshold va khong auto-conclude.
- T11B2B2: risk/rate-limit/captcha ports va time/space/plate candidate producer
  sau khi cac gate T09/T10/D-09 lien quan duoc phe duyet.

## Source requirements

- REQ-04: phan anh an danh, chong spam/trung; khong lo PII.
- REQ-05: evidence pipeline rieng, checksum/quarantine/download authorization.
- Source T11: report state machine, plate text marked unverified, duplicate
  suggestion only, operator verification required, general public status only.
- ADR-004: business report table khong chua citizen technical identity.
- ADR-005: evidence chi readable sau pipeline READY.
- ADR-006: state change phat event bang transactional outbox.
- ADR-010: public code entropy cao, khong tuan tu va projection tong quat.

## Current state

- T03 da co anonymous citizen session va guard.
- T04 da co schema `report`, transaction/outbox/idempotency primitives.
- T10B1-B3 da co upload/scan/controlled access local; T11B1 da noi READY object
  vao report atomically, nhung production/UAT con bi khoa boi provider/secret
  resolver/D-09.
- Domain da co lifecycle rules; T11B2A da noi manual dispatcher decision.
- T11B2B1 da noi idempotent screening consumer va exact READY-evidence SHA
  suggestion; worker mac dinh tat va chi duoc bat local/test.
- Intake/tracking/evidence-link/operator/screening contracts, runtime va tests da co.

## Decisions and blockers

- D-05: area local/test chi la synthetic; deployment phai truyen area ro rang.
- D-06: khong auto-delete/retention job; history va report duoc giu dormant khi
  rollback.
- D-07: khong thu identity, khong unmask, khong co default join privacy vault.
- D-09: khong tu dat media/load/rate/duplicate thresholds. Exact SHA equality
  khong dung threshold va chi tao suggestion; cac heuristic/rate/risk con lai bi
  khoa den khi co tham so test/phe duyet.
- `REPORT_INTAKE_ENABLED=false` mac dinh; neu bat phai co area + idempotency TTL.
  Staging/production bi chan den khi T11B production gates hoan tat.

## Change map

| Area       | Files                                     | Change                                                | Risk                         |
| ---------- | ----------------------------------------- | ----------------------------------------------------- | ---------------------------- |
| Contract   | `packages/contracts/src/reports`, OpenAPI | Strict submit/accepted/tracking/event schemas         | Public data leak             |
| Domain     | `packages/domain/src/reports`             | State machine + general status projection             | Invalid automatic conclusion |
| Database   | migrations 10-13 + synthetic seed         | PII-free report, history, candidate, exact-hash index | Identity/retention leak      |
| Runtime    | config + API + worker report modules      | Fail-closed intake/screening, inbox/outbox atomicity  | Replay/auth/auto-conclusion  |
| Tests/docs | unit/contract/integration/HANDOFF         | Verify atomicity, privacy, tracking                   | False confidence             |

## Implementation sequence

1. T11A contract, domain lifecycle and expand-only migration.
2. T11A application repository: validate enabled category, commit report,
   initial history, privacy-safe audit, outbox and exact 202 response together.
3. T11A public controller protected by citizen session; invalid/unknown tracking
   codes share uniform 404.
4. T11A test gates, cold start, docs and disabled-by-default rollout.
5. T11B1 READY evidence ownership/linking local/test, capability protected.
6. T11B2A operator queue/manual decision/duplicate override, khong sinh heuristic.
7. T11B2B1 local/test idempotent screening + exact READY-evidence SHA suggestion.
8. T11B2B2 only after explicit values/gates: abuse ports va time/space/plate
   candidate producer. No heuristic may auto-conclude a violation.

## Test plan

- Unit/domain: every allowed/denied transition, reason/version/actor rules,
  generalized status mapping and plate field remains explicitly unverified.
- Integration: one transaction contains report/history/audit/outbox/idempotency;
  replay and concurrent submit create one report; business table column scan has
  no session/IP/device/account/token fields.
- Contract/OpenAPI/events: strict request, no identity fields, event omits
  public code/location/plate/description, generated OpenAPI drift check.
- E2E and authorization-negative: submit requires citizen session; malformed
  and unknown public codes use the same not-found class.
- Failure/degraded/rollback: disabled/missing policy fails before transaction;
  category unavailable is stable 422; no provider on intake transaction path.

## Rollout and rollback

- Feature flag: `REPORT_INTAKE_ENABLED=false`; staging/production enable is
  rejected until T11B production gates are explicitly completed.
- Migration compatibility: migrations 10-13 are expand-only; migration 11 adds
  a narrow attachment function and does not rewrite existing rows/events.
  Migration 12 adds suggestion-only candidates and queue cursor assigned on entry;
  migration 13 adds an exact SHA/owner lookup index without rewriting evidence.
- Deploy order: migration -> API/worker -> clients. Rollback worker/config first and keep
  report/history/outbox data dormant; do not drop or delete acknowledged data.

## Definition of done

- [x] Anonymous normal path requires a valid citizen session and returns 202.
- [x] Business report schema and privacy-safe event contain no identity.
- [x] Plate field is named `plate_text_unverified` end to end.
- [x] Operator verification remains mandatory; no auto enforcement path exists.
- [x] Citizen tracking returns only received/in-progress/completed/
      insufficient-basis.
- [x] `pnpm format:check`, lint, typecheck, unit/coverage, contract, integration,
      e2e and build pass; migration changes also pass cold start.

## Progress log

- [x] Source/ADR/current-state review complete.
- [x] T11A implementation.
- [x] T11A full local gates and cold start.
- [x] T11A GitHub CI run `32221632793` green 6/6.
- [x] T11B1 READY evidence ownership/linking local implementation + cold start.
- [x] T11B1 GitHub CI run `32223513120` green 6/6.
- [x] T11B2A operator queue/manual verification/duplicate override local + cold start.
- [x] T11B2A GitHub CI run `32228563065` green 6/6.
- [x] T11B2B1 local exact-hash screening/candidate producer + cold start; API
      integration 66/66, worker integration 9/9.
- [ ] T11B2B2 risk/rate-limit/captcha/time-space-plate heuristics (blocked by D-09).

## Handoff

- Changed files: executable screening event contracts/OpenAPI, fail-closed worker
  config, migration 13 exact-hash index, Rabbit bindings, coordinator/queue/job,
  integration tests and handoff/security/data/runbook docs.
- Tests run/results: focused screening integration proves idempotent state/history/
  audit/outbox/inbox, privacy-safe exact-hash candidate, event mismatch rollback
  and candidate-cap overflow rollback. Full local gates are recorded in HANDOFF.
- Remaining risks: no captcha/rate/risk or time/space/plate producer. Exact hash is
  suggestion-only and may still be a false positive. Production enable remains
  rejected; technical scheduler bounds are explicit deployment input, not policy.
- Rollback steps: set `REPORT_SCREENING_WORKER_ENABLED=false`,
  `REPORT_EVIDENCE_LINKING_ENABLED=false` and
  `REPORT_INTAKE_ENABLED=false`, roll back API/client code and keep migrations
  10-13/report/evidence ownership/candidate/audit/outbox/inbox data dormant. Do not
  detach evidence or delete acknowledged records while D-06 is pending.
