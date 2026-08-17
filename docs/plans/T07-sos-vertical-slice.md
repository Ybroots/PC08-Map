# T07 - SOS incident vertical slice

## Outcome

Một SOS tối giản được API công khai xác nhận độc lập với VietMap, RabbitMQ và
notification. Một transaction PostgreSQL duy nhất lưu incident, trạng thái
RECEIVED, audit, outbox và phản hồi idempotency. Trực ban có queue/feed theo
phạm vi với cursor tiếp tục; công dân chỉ tra được trạng thái tổng quát bằng mã
ngẫu nhiên không tuần tự.

## Source requirements

- REQ-01: GPS, độ chính xác, thời gian và payload SOS tối giản.
- Section 6.3: state machine incident, precondition, actor, reason và lịch sử
  append-only.
- Section 7.1-7.3: Idempotency-Key, Problem Details, trace, outbox và
  `incident.received.v1`.
- Section 9.2-9.3: phân biệt server acknowledgement; ops feed có resume token.
- ADR-001 modular monolith; ADR-004 không để technical identity trong bảng
  business; ADR-006 transactional outbox; ADR-009 EPSG:4326 `[lon, lat]`;
  ADR-010 public tracking code ngẫu nhiên và projection tối thiểu.

## Current state

- T02 có Zod/OpenAPI, Problem Details, request trace và PostgreSQL idempotency
  primitives; contract SOS chưa nối runtime và đang để key trong body.
- T03 có deny-by-default guard và mock OIDC local; D-02 vẫn pending.
- T04 có bảng incident/history, scoped read repository, transaction/outbox/inbox
  primitives và synthetic incident catalog.
- T05/T06 không được tham gia critical path tiếp nhận SOS.
- Chưa có incident aggregate, write repository/controller, public tracking,
  resumable ops feed, outbox relay hoặc incident queue UI.

## Decisions and blockers

- D-04 pending: T07 không tạo SLA, deadline, escalation hoặc inter-agency rule.
- D-05 pending: intake area là deployment config bắt buộc khi feature bật;
  local/test dùng giá trị synthetic. Không suy ra service area hay auto-assign.
- D-06 pending: không có background retention/auto-delete cho incident, history,
  audit hoặc outbox. Idempotency TTL là deployment config bắt buộc để thực thi
  retry contract; một exact key claim có thể thay record dedupe đã hết hạn và
  không được coi là retention policy cho business data.
- D-08 pending: không gọi notification provider; event downstream là đủ.
- D-09 pending: relay poll/batch là config bắt buộc khi bật, không có production
  default. Rate-limit/load threshold chưa được tuyên bố.
- Khi SOS ingest chưa có đủ config, endpoint fail-closed; core health vẫn sống.

## Change map

| Area       | Files                                              | Change                                                                         | Risk                                       |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Migration  | `infra/compose/postgres/07-sos-vertical-slice.sql` | Feed sequence, immutable accepted payload, supporting indexes                  | Rolling compatibility, append-only history |
| Domain     | `packages/domain/src/incidents`                    | Full transition graph, actor/precondition/reason invariants, public projection | Unauthorized jump                          |
| Contracts  | `packages/contracts/src/incidents`, OpenAPI        | Header idempotency, accepted/tracking/ops feed/transition/event schemas        | Contract drift/data leak                   |
| Config     | `packages/config`                                  | SOS intake and outbox relay fail-closed config                                 | Invented production values                 |
| API        | `apps/api/src/modules/incidents`                   | Atomic intake, replay, scoped feed, transition, tracking, metrics              | Duplicate accept, IDOR, PII leak           |
| Worker     | `apps/worker`                                      | Advisory-locked at-least-once outbox relay through publisher port              | Provider outage/message duplication        |
| UI         | `apps/ops-web/app/incidents`                       | Explicit contract shell for incident queue/resume/degraded states              | Fake auth/data confusion                   |
| Docs/tests | plans, data/runbook/UAT/tests                      | Traceability, cold start, failure and rollback proof                           | Incomplete handoff                         |

## Implementation sequence

1. Add expand-only migration and Compose init ordering.
2. Implement framework-free incident state machine and public-state projection.
3. Replace placeholder SOS DTO with executable header/body/response, tracking,
   feed and transition contracts; generate OpenAPI.
4. Implement atomic idempotent intake repository, public/ops controllers,
   actual-scope rechecks, audit/outbox/history and aggregate metrics.
5. Add advisory-locked outbox relay worker through a RabbitMQ port/adapter;
   provider failure may only leave a pending outbox row.
6. Add the PC08 incident queue contract shell and visual regression smoke.
7. Run cold start, all gates, provider-disabled and concurrency tests; update
   README/handoff/runbooks.

## Test plan

- Unit/domain: allowed graph, role denial, required reason, forbidden jump,
  optimistic version and public projection.
- Integration: online accept; exact replay; different-payload conflict;
  concurrent submit creates one incident; incident/history/audit/outbox/
  idempotency atomicity; provider disabled; privacy-negative columns.
- Contract/OpenAPI/events: header/body separation, stable schemas,
  `incident.received.v1` payload and generated artifact drift.
- E2E and authorization-negative: accepted SOS appears in scoped ops feed;
  cross-area and role denial; tracking invalid/missing code is indistinguishable;
  resume cursor has no gap/duplicate.
- Failure/degraded/rollback: Rabbit publisher failure leaves outbox pending and
  does not roll back accepted SOS; worker retry is at-least-once/idempotent-safe.

## Rollout and rollback

- Feature flags: `SOS_INGEST_ENABLED=false` and `OUTBOX_RELAY_ENABLED=false` by
  default. Enabling requires explicit intake area/idempotency TTL and relay
  poll/batch configuration respectively.
- Migration compatibility: expand-only; existing T04 writers remain valid.
- Deploy order: migration -> contracts/API -> worker -> ops web. Enable ingest
  only after config and synthetic smoke; enable relay independently.
- Rollback application/worker/web first. Leave incident/history/audit/outbox and
  feed sequence intact; never drop accepted emergency records.

## Definition of done

- [x] POST public SOS is minimal, idempotent and provider-independent.
- [x] Incident, initial history, audit, outbox and stored response are atomic.
- [x] Duplicate/concurrent retry produces one incident and stable response.
- [x] Resumable scoped ops feed exposes accepted SOS without cross-area leak.
- [x] State transition rejects role/precondition/version violations.
- [x] Public tracking returns only the approved generalized status.
- [x] Aggregate intake latency/count metrics exist without sensitive labels.
- [x] Outbox publisher failure cannot change an accepted response.
- [x] Cold start and all repository gates pass.

## Progress log

- [x] 2026-08-17: inspected T02-T06 primitives, requirements, ADRs and hard
      stops; execution plan written before code.
- [x] 2026-08-17: implementation, cold start, HTTP/provider-disabled smoke,
      visual QA and all gates completed.

## Handoff

- Changed files: migration 07; incident domain/contracts/config/API; outbox
  relay; ops incident shell; OpenAPI, data/runbook/roadmap/handoff and tests.
- Tests run/results: 144 unit/contract tests, 45 integration tests, OpenAPI
  drift, provider-disabled HTTP smoke, 3 visual viewports and full build pass.
- Remaining risks: D-02/D-04/D-05/D-06/D-08/D-09/D-10 remain open.
- Rollback steps: disable ingest/relay, roll back application deploys, retain
  all accepted incident and append-only records.
