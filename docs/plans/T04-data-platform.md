# T04 - Nền tảng dữ liệu và PostGIS

## Outcome

API dùng một PostgreSQL pool chung, có transaction boundary và transactional
outbox writer. Schema lõi cho incident, dispatch và map được tạo bằng migration
forward-only; dữ liệu điểm dùng `geography(Point, 4326)` và truy vấn khoảng cách
dùng mét. Incident repository không có overload đọc không scope: mọi lần đọc đều
phải nhận branded `AccessScope` và áp dụng lại policy role/unit/area/case/data
class trước khi trả dữ liệu.

## Source requirements

- T04 nguồn: nền tảng dữ liệu, PostGIS, migration, transaction và scoped
  repository làm nền cho T06/T07/T08/T10/T12/T16.
- ADR-001: modular monolith, repository thuộc module và giao tiếp qua public
  application service/domain event.
- ADR-004: business table không chứa citizen technical identity; privacy vault
  không có default join.
- ADR-006: state change và outbox event cùng transaction; consumer có inbox
  deduplication.
- ADR-009: API `[longitude, latitude]`, PostGIS point dùng
  `geography(Point, 4326)`, geometry polygon/line có GiST index.
- T03 handoff: repository chỉ nhận branded `AccessScope`.
- Repository rules: UTC timestamps, deny-by-default, forward-only expand/contract,
  không log case notes/identity/evidence keys.

## Current state

- Compose đã có PostgreSQL 16 + PostGIS 3.4, schemas, roles, outbox,
  idempotency, audit và identity tables.
- DDL cho `incident_type_catalog`, `dispatch.units`, `map.layers` và
  `map.features` đang nằm trong dev seed; vì vậy production migration chưa có
  schema lõi tương ứng.
- API identity tự tạo một Pool riêng; chưa có database module dùng chung,
  transaction manager hoặc outbox writer.
- Domain đã có `GeoPoint`, `PublicCode` và state enums, nhưng chưa có scoped
  incident persistence adapter.
- T03 policy đã kiểm tra role + unit + area + case + data class và branded scope,
  nhưng chưa có repository thực tế tiêu thụ scope đó.

## Decisions and blockers

- D-01 pending: dùng reference stack, không tuyên bố production-ready.
- D-05 pending: `dispatch.units` chỉ nhận synthetic fixtures; `service_area`
  nullable và không import catalog/GeoJSON thật.
- D-06 pending: tạo cột/classification cần thiết nhưng không đặt retention period,
  không tạo cleanup/auto-delete job.
- D-07 pending: không tạo privacy identity link hoặc unmask query; privacy schema
  vẫn tách role và đóng với app.
- D-09 pending: không tự đặt query/load/media limit. Repository T04 chỉ hỗ trợ
  đọc theo ID; radius/pagination policy thuộc task có requirement cụ thể.
- T04 không triển khai incident state transition, dispatch SLA, map approval,
  evidence lifecycle hoặc public API; các workflow đó thuộc T06-T10.

## Change map

| Area                 | Files                                            | Change                                                                       | Risk control                                                   |
| -------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Migration            | `infra/compose/postgres/05-core-data-tables.sql` | Incident/history, dispatch base, map base, inbox and outbox envelope columns | Constraints, GiST indexes, append-only history, no PII columns |
| Seed                 | `infra/compose/seed/01-dev-seed.sql`             | Chỉ insert synthetic data, không sở hữu DDL                                  | Cold start proves migration order                              |
| Database platform    | `apps/api/src/platform/database`                 | Shared pool, transaction manager, outbox writer                              | Rollback on error; no provider call inside primitive           |
| Identity             | `apps/api/src/modules/identity`                  | Reuse shared pool                                                            | One lifecycle owner and bounded pool count                     |
| Incident persistence | `apps/api/src/modules/incidents`                 | Scoped read repository                                                       | Scope brand + policy re-evaluation + no existence leak         |
| Tests/docs           | API unit/integration, dictionary/runbook/README  | Atomicity, PostGIS, negative authorization and schema checks                 | Deterministic synthetic fixtures                               |

## Implementation sequence

1. Add forward-only core migration and mount before dev seed.
2. Move schema creation out of seed; retain only fake Lam Dong inserts.
3. Add shared database pool, transaction manager and validated outbox writer;
   refactor identity adapters to consume it.
4. Add incident read repository requiring `AccessScope` and applying
   `AuthorizationPolicy` to the loaded resource.
5. Add unit and PostgreSQL/PostGIS integration tests, cold-start Compose, update
   documentation and run all repository gates.

## Test plan

- Unit/domain: transaction commit/rollback behavior with a fake client; outbox
  envelope validation; forged/missing/cross-scope incident reads denied.
- Integration/PostGIS: schema/constraints/indexes, longitude-latitude round trip,
  distance in meters, invalid public code/coordinate rejection.
- Transaction/outbox: incident row and event commit together; forced error rolls
  both back; inbox duplicate claim has one winner.
- Authorization-negative: cross-area, cross-unit, cross-case, over-classification
  and disallowed role return `null` without leaking record existence.
- Privacy-negative: incident/report schemas contain no IP, fingerprint, account,
  session-token or citizen technical identity column.
- Contract: existing OpenAPI/event drift remains green; T04 adds no HTTP route.

## Rollout and rollback

- No feature flag: migration and database primitives are inert until a later
  business module calls them.
- Migration uses expand-only tables/columns/indexes; outbox envelope columns stay
  nullable for compatibility with an older writer during rolling deploy.
- Deploy order: database migration, shared packages, API, then later feature
  modules. Seed is local-only and never a production migration.
- Roll back application code first. Do not drop new tables or outbox/inbox rows;
  leave them dormant and use a later reviewed contract migration if removal is
  necessary.

## Definition of done

- [x] Core DDL is migration-owned and cold start succeeds before seed.
- [x] Point coordinates round-trip as EPSG:4326 `[longitude, latitude]`.
- [x] GiST spatial indexes and database constraints are verified.
- [x] Transaction manager commits/rolls back incident + outbox atomically.
- [x] Inbox claim is idempotent under duplicates.
- [x] Identity and future modules share one managed PostgreSQL pool.
- [x] Incident repository cannot be called with an unresolved scope.
- [x] Cross-area/unit/case/data-class/role reads deny without existence leak.
- [x] No citizen technical identity appears in business schemas.
- [x] Full repository gates and cold-start integration pass.

## Progress log

- [x] Repository, ADRs, Decision Register and existing schema inspected.
- [x] Scope separated from T06/T07/T08/T10 workflows and hard-stop values.
- [x] Migration and adapters implemented.
- [x] Final migration cold start, 111 unit tests and 30 integration tests pass.
- [x] Format, lint, typecheck, coverage, contract drift, e2e prerequisite and
      build pass.

## Handoff

T04 provides persistence primitives only. T05 can proceed independently;
T06/T07 consume the schema and transaction/outbox boundary. Real service areas,
retention, break-glass, SLA and load limits remain blocked by D-05/D-06/D-07/
D-09 and must not be inferred here.
