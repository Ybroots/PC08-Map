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
| T06  | NEXT                 | Map data lifecycle; không phụ thuộc live VietMap               |
| T07+ | TODO                 | Theo thứ tự/phụ thuộc trong README và từng execution plan      |

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

## Bước tiếp theo đề xuất: T06

1. Đọc `docs/plans/T06-map-data-lifecycle.md`, source requirements và ADR-009.
2. Điền execution plan trước khi code; tách rõ workflow map khỏi provider T05.
3. Triển khai vertically: migration/contract -> domain states -> scoped API ->
   ops/public consumers -> tests/docs/telemetry.
4. Bắt buộc maker-checker, immutable submitted version, publish/expire validity,
   GeoJSON validation và public query chỉ trả `PUBLISHED` trong validity window.
5. Không dùng service-area thật, retention period hoặc live VietMap khi decision
   tương ứng còn pending.

T07 cũng có thể bắt đầu từ T04 nếu ưu tiên SOS vertical slice. SOS acceptance
phải commit được khi VietMap/notification hỏng.

## Kiểm chứng và lệnh chuẩn

Lần kiểm chứng local gần nhất (2026-08-17): frozen install, format, lint,
typecheck, 124 unit tests, coverage, OpenAPI/contract drift, 30 integration tests,
e2e prerequisite và 12 build tasks đều pass. API boot smoke có
`MapProviderModule`, `/api/v1/health/live` trả 200 kèm request ID. GitHub CI của
commit T05 phải được kiểm tra sau khi push.

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

## Rollback chung cho T05

T05 không có database migration. Roll back API module registration và package
changes cùng một release. Giữ `VIETMAP_USE_FAKE_ADAPTER=true` ở local/test; ở
production/pilot chưa duyệt D-03, provider-backed feature phải unavailable, không
được thay bằng dữ liệu fake.
