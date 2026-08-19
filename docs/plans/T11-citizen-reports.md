# T11 - Citizen reports va chong lam dung

## Outcome

Tao luong phan anh an danh, PII-free va co ma tra cuu ngau nhien. T11 duoc
chia nho de khong vuot cac cong production dang mo:

- T11A: intake + public tracking foundation. Citizen session submit mot report
  text/location/plate-unverified, idempotent acknowledgement, append-only
  history/audit va atomic outbox. Runtime chi duoc bat o local/test.
- T11B: evidence linking, risk/rate-limit/captcha port, duplicate candidates,
  operator verification queue va false-positive override sau khi cac gate
  T09/T10/D-09 lien quan duoc phe duyet.

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
- T10B1-B3 da co upload/scan/controlled access local, nhung production/UAT con
  bi khoa boi provider/secret resolver/D-09.
- Domain da co enum `ReportState` nhung chua co lifecycle rules.
- Chua co report contract, table, runtime module, public tracking hay tests.

## Decisions and blockers

- D-05: area local/test chi la synthetic; deployment phai truyen area ro rang.
- D-06: khong auto-delete/retention job; history va report duoc giu dormant khi
  rollback.
- D-07: khong thu identity, khong unmask, khong co default join privacy vault.
- D-09: khong tu dat media/load/rate/duplicate thresholds. T11B bi khoa den khi
  co tham so test/phe duyet.
- `REPORT_INTAKE_ENABLED=false` mac dinh; neu bat phai co area + idempotency TTL.
  Staging/production bi chan den khi T11B production gates hoan tat.

## Change map

| Area       | Files                                     | Change                                                | Risk                         |
| ---------- | ----------------------------------------- | ----------------------------------------------------- | ---------------------------- |
| Contract   | `packages/contracts/src/reports`, OpenAPI | Strict submit/accepted/tracking/event schemas         | Public data leak             |
| Domain     | `packages/domain/src/reports`             | State machine + general status projection             | Invalid automatic conclusion |
| Database   | migration 10 + synthetic seed             | PII-free report, catalog, append-only history         | Identity/retention leak      |
| Config/API | config + `apps/api/src/modules/reports`   | Fail-closed intake, session guard, idempotency/outbox | Replay/auth bypass           |
| Tests/docs | unit/contract/integration/HANDOFF         | Verify atomicity, privacy, tracking                   | False confidence             |

## Implementation sequence

1. T11A contract, domain lifecycle and expand-only migration.
2. T11A application repository: validate enabled category, commit report,
   initial history, privacy-safe audit, outbox and exact 202 response together.
3. T11A public controller protected by citizen session; invalid/unknown tracking
   codes share uniform 404.
4. T11A test gates, cold start, docs and disabled-by-default rollout.
5. T11B only after gates: evidence ownership/linking, abuse ports, duplicate
   candidates and operator queue. No heuristic may auto-conclude a violation.

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
- Migration compatibility: migration 10 is expand-only; no existing table or
  event is rewritten.
- Deploy order: migration -> API -> clients. Rollback API/config first and keep
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
- [ ] T11B evidence/abuse/duplicate/operator workflow (blocked by gates above).

## Handoff

- Changed files: report executable contracts/OpenAPI, report domain lifecycle,
  config policy, API report module, migration 10, synthetic seed, integration
  tests, data dictionary and HANDOFF.
- Tests run/results: format/lint/typecheck/unit/coverage/contract/e2e/build pass;
  cold-start non-cached integration passes API 56/56 and worker 5/5. HTTP path
  proves missing session 401, session create, 202 accept/exact replay and minimal
  tracking; Rabbit holds `report.received.v1` in a durable screening queue.
- Remaining risks: no T11B evidence link, captcha/rate/risk port, duplicate
  candidate or ops verification queue. Production enable remains rejected.
- Rollback steps: set `REPORT_INTAKE_ENABLED=false`, roll back API/client code and
  keep migration 10/report/history/audit/outbox/idempotency data dormant. Do not
  drop or delete acknowledged reports while D-06 is pending.
