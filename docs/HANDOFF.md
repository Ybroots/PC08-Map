# Project handoff - ATGT Platform

Đây là điểm bắt đầu cho người hoặc agent tiếp quản repository. Đọc tiếp
`AGENTS.md`, Decision Register và plan của task được chọn trước khi sửa code.

## Trạng thái hiện tại

| Task | Trạng thái           | Kết quả có thể dùng tiếp                                       |
| ---- | -------------------- | -------------------------------------------------------------- |
| T00  | DONE                 | Monorepo, CI, kiến trúc và quality gates                       |
| T01  | DONE                 | Local Compose 8 service, roles/schemas/seed/telemetry          |
| T02  | DONE                 | Executable contracts, Problem Details, trace, idempotency      |
| T03  | DONE                 | Mock/OIDC identity, citizen session, deny-by-default policy    |
| T04  | DONE                 | PostGIS schema, transaction/outbox/inbox, scoped repository    |
| T05  | SAFE FOUNDATION DONE | Fake/resilience/API wiring xong; real VietMap BLOCKED bởi D-03 |
| T06  | DONE                 | Versioned map, maker-checker, public bbox, lifecycle worker    |
| T07  | NEXT                 | SOS vertical slice; không phụ thuộc provider để accept         |
| T08+ | TODO                 | Theo thứ tự/phụ thuộc trong README và từng execution plan      |

T05 không được gọi là production VietMap integration. Hai tiêu chí còn mở là
real HTTP adapter/contract fixtures và sandbox contract suite; xem
`docs/plans/T05-vietmap-adapter.md`.

## Nền kiến trúc đã hoàn thành

- API là NestJS modular monolith; domain không import framework/vendor SDK.
- Cấu hình được parse fail-closed trước bootstrap.
- HTTP contract dùng Zod/OpenAPI, stable Problem Details và trace ID.
- PostgreSQL/PostGIS có migration-owned schema; seed chỉ chứa synthetic data.
- State change có transaction/outbox primitive; consumer có idempotent inbox.
- Authorization bắt buộc role + unit + area + case + data class, deny by default.
- Map provider có port, deterministic fake, allowlisted input, opaque cache key,
  bounded stale/retry, per-API circuit, quality metadata và quota telemetry.
- Tắt fake không gọi VietMap thật: provider call trả
  `CONFIGURATION_BLOCKED`, core health vẫn hoạt động.
- Map data có schema registry, version aggregate, immutable-on-submit trigger,
  maker-checker, diff summary, append-only history và transactional outbox.
- Public bbox chỉ trả layer public/version public + PUBLISHED + còn hiệu lực;
  PostGIS GiST index được xác nhận trong integration plan.
- Worker publish/expire idempotent, mặc định tắt và fail-closed nếu thiếu poll
  interval; không có retention auto-delete.

## Hard stops còn mở

Không tự điền các giá trị sau; xem `docs/plans/DECISION-REGISTER.md`:

- D-01 official stack/team capability.
- D-02 officer IdP/SSO/MFA (local đang dùng mock).
- D-03 VietMap API version/auth/key/quota/pricing/cache license/sandbox.
- D-04 SLA/escalation/inter-agency rules.
- D-05 real unit capability/service-area GeoJSON.
- D-06 retention/legal hold; không có auto-delete.
- D-07 anonymous unmask/break-glass; feature disabled.
- D-08 notification provider/channels.
- D-09 load profile/media limits.
- D-10 ATTT classification; không tuyên bố đạt cấp độ.

## Bước tiếp theo đề xuất: T07

1. Đọc `docs/plans/T07-sos-vertical-slice.md`, requirements SOS và state machine.
2. Viết execution plan trước code, giữ incident business table không chứa IP,
   session token, fingerprint hoặc linkage identity.
3. Triển khai vertical slice contract/domain/use case/repository/API/outbox trước
   khi nối UI/mobile.
4. SOS acceptance phải commit được khi VietMap, map lifecycle hoặc notification
   lỗi; enrichment là downstream/degraded path.
5. D-04/D-05/D-06/D-09 vẫn là hard stop: không tự đặt SLA, unit/service area,
   retention hay load limit.

## Kiểm chứng và lệnh chuẩn

Lần kiểm chứng T06 local (2026-08-17): cold start volume rỗng lên đủ 8 service;
130 unit tests có coverage, 35 API integration tests và 1 worker integration
test pass; public HTTP bbox trả đúng seed synthetic; OpenAPI drift/e2e prerequisite
và 12 build tasks pass. Bốn visual viewport không lỗi console hay overflow. Cập
nhật commit và GitHub CI vào cuối handoff sau khi push.

Từ repository root:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:contract
pnpm test:integration
pnpm test:e2e
pnpm build
```

Khi thay đổi migration/infra, chạy thêm cold start theo
`docs/runbooks/local-dev.md`. Không xóa volume nếu chưa xác nhận dữ liệu local có
thể mất. Review `git diff`, secret scan và generated artifact scan trước commit.

## Tài liệu điều hướng

- Quy tắc bắt buộc: `AGENTS.md`
- Roadmap: `README.md` và `docs/plans/T00-T20`
- Quyết định còn mở: `docs/plans/DECISION-REGISTER.md`
- T05 boundary: `docs/integrations/vietmap.md`
- Data schema: `docs/data/data-dictionary.md`
- Local operations: `docs/runbooks/local-dev.md`
- Security: `docs/security/threat-model.md` và `access-control.md`

## Rollback T06

Deploy rollback theo thứ tự web/worker/API; giữ migration T06 dormant vì đây là
expand-only và chứa approval/audit history. Tắt worker bằng
`MAP_LIFECYCLE_WORKER_ENABLED=false`. Không drop version/history và không sửa
feature đã submit. Seed/local volume có thể reset vì chỉ chứa dữ liệu synthetic.

## Rollback T05

T05 không có database migration. Roll back API module registration và package
changes cùng một release. Giữ `VIETMAP_USE_FAKE_ADAPTER=true` ở local/test; ở
production/pilot chưa duyệt D-03, provider-backed feature phải unavailable, không
được thay bằng dữ liệu fake.
