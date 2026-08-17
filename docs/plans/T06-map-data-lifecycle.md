# T06 - Map data lifecycle

## Outcome

Cán bộ dữ liệu có thể preview/import GeoJSON thành version draft, submit để khóa
nội dung, và một cán bộ khác approve/publish/withdraw theo area scope. Worker có
job idempotent publish/expire theo clock và ghi outbox cache-invalidation event.
Public API chỉ trả feature của layer public, data class public, version
`PUBLISHED`, còn hiệu lực và cắt theo bbox. Ops/public web có shell trực quan cho
lifecycle nhưng không giả lập quyền đăng nhập khi D-02 còn pending.

## Source requirements

- T06 nguồn: versioned layer/feature CRUD, schema registry, GeoJSON validation,
  maker-checker, scheduled publish/expiry, public bbox/zoom API.
- Mục 6.2/6.4: EPSG:4326 `[longitude, latitude]`, valid geometry, immutable
  version và state `DRAFT -> IN_REVIEW -> APPROVED -> PUBLISHED -> EXPIRED |
WITHDRAWN -> ARCHIVED`.
- Mục 7.2/7.3: public layer endpoint, admin transition endpoints, transactional
  outbox and cache invalidation.
- ADR-001, ADR-006, ADR-009; access-control data editor/approver area scopes.

## Current state

- T04 có `map.layers` và `map.features`, GiST geometry index và validity/state
  columns nhưng `version_id` chưa có aggregate/FK.
- Chưa có layer schema registry, approvals, immutable submitted version,
  transition/diff audit, repository, application service hoặc map controller.
- Authorization có `MAP_DRAFT_WRITE`, `MAP_PUBLISH` và public map action.
- Contract event đã có `map.version.published.v1`; worker còn là stub.
- Ops web chỉ có D-02 access gate; citizen web là placeholder.

## Decisions and blockers

- D-02 pending: UI là lifecycle/public shell; mọi admin API vẫn cần mock OIDC ở
  local/test và real OIDC ngoài local.
- D-05 không dùng service-area/unit catalog thật; local map area là synthetic.
- D-06 pending: không auto-delete/archive theo retention; `EXPIRED` giữ nguyên
  immutable history.
- D-09 pending: không tự đặt import/media/load quota. Bbox/zoom contract và GiST
  index có test query plan; production thresholds chờ load profile.
- Không dùng live VietMap; T06 render geometry/data riêng qua API.

## Change map

| Area             | Files                                       | Change                                                             | Risk control                                           |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| Migration        | `06-map-data-lifecycle.sql`                 | schemas, versions, approvals, diffs, immutability triggers/indexes | expand-only; backfill existing seed                    |
| Contracts/domain | `packages/contracts`, `packages/domain/map` | GeoJSON DTOs/events and pure state machine                         | strict runtime validation                              |
| API              | `modules/map-data`                          | preview/create/submit/approve/publish/withdraw/public bbox         | guard + scope recheck + transactions                   |
| Worker           | `apps/worker`                               | idempotent due publish/expiry job                                  | feature-disabled scheduling until poll config approved |
| UI               | ops/citizen web map routes                  | lifecycle sheet and public layer explorer                          | no auth bypass or internal geometry                    |
| Docs/tests       | plan/dictionary/runbook/handoff             | operations, negative/security/performance evidence                 | deterministic clock/fixtures                           |

## Implementation sequence

1. Add forward-only migration and backfill existing synthetic feature/version.
2. Add executable GeoJSON/map contracts and pure lifecycle invariants.
3. Implement scoped repository/service/controllers with atomic audit/outbox.
4. Add worker job for scheduled publish/expiry and cache invalidation.
5. Build ops/public shells from the same lifecycle vocabulary.
6. Cold start, integration/contract/authorization/UI gates and handoff update.

## Test plan

- Domain: allowed/denied transitions, validity clocks and maker-checker.
- Contract: coordinate/ring/type/schema/error report and OpenAPI drift.
- PostGIS: self-intersection/type mismatch, immutable submitted feature, bbox
  GiST plan, draft/private/expired/future leak negatives.
- Application: submitter cannot approve; cross-area/data-class/role denied;
  publish transaction includes audit/outbox.
- Worker: fake clock due publish/expiry, duplicate runs idempotent.
- UI: build/typecheck, keyboard focus, responsive layout, reduced motion.

## Rollout and rollback

- Migration is expand-only and retains T04 columns; backfills a published version
  for pre-existing seed features before adding the version FK.
- Deploy migration -> contracts/domain -> API -> worker disabled -> web. Enable
  scheduled polling only with approved environment-specific poll configuration.
- Roll back code first; keep new tables/columns/history dormant. Never drop
  approved/published history to roll back.

## Definition of done

- [x] GeoJSON import has preview and indexed error report.
- [x] Submitted version/features are immutable at the database boundary.
- [x] Submitter cannot approve; role/area/data-class denials are tested.
- [x] Publish/expiry uses deterministic clock and outbox invalidation.
- [x] Public bbox returns only public, published, currently valid data.
- [x] Version diff and append-only approval/transition audit exist.
- [x] Ops/public web lifecycle views build responsively.
- [x] Full local gates and cold start pass.
- [ ] GitHub CI pending push.

## Progress log

- [x] Source, ADRs, T04 schema, authorization and UI baseline reviewed.
- [x] D-02/D-05/D-06/D-09 boundaries recorded before implementation.
- [x] Migration/contracts/domain.
- [x] API/worker/UI.
- [x] Cold start, PostGIS/integration and visual smoke verification.
- [x] Final local gates and handoff.
- [ ] Push and GitHub CI.

## Handoff

Implemented boundaries to preserve in later work:

- Public repository selects one current version only after checking layer
  visibility, `data_class=public`, `state=PUBLISHED` and UTC validity.
- `map_feature_content_immutable` blocks INSERT/UPDATE/DELETE after draft; state
  mirroring remains allowed for lifecycle transitions.
- Approvals and transitions are append-only; lifecycle events use the outbox.
- Scheduler stays disabled unless both the enable flag and a D-09-approved poll
  value are supplied.
- T07 may read the public map boundary, but SOS acceptance must remain
  independent from map/VietMap availability.
