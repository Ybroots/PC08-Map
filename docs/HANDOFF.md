# Project handoff - ATGT Platform

Đây là điểm bắt đầu cho người hoặc agent tiếp quản repository. Đọc tiếp
`AGENTS.md`, Decision Register và plan của task được chọn trước khi sửa code.

## Trạng thái hiện tại

| Task | Trạng thái            | Kết quả có thể dùng tiếp                                       |
| ---- | --------------------- | -------------------------------------------------------------- |
| T00  | DONE                  | Monorepo, CI, kiến trúc và quality gates                       |
| T01  | DONE                  | Local Compose 8 service, roles/schemas/seed/telemetry          |
| T02  | DONE                  | Executable contracts, Problem Details, trace, idempotency      |
| T03  | DONE                  | Mock/OIDC identity, citizen session, deny-by-default policy    |
| T04  | DONE                  | PostGIS schema, transaction/outbox/inbox, scoped repository    |
| T05  | SAFE FOUNDATION DONE  | Fake/resilience/API wiring xong; real VietMap BLOCKED bởi D-03 |
| T06  | DONE                  | Versioned map, maker-checker, public bbox, lifecycle worker    |
| T07  | DONE                  | Atomic SOS, replay, tracking, scoped feed, relay + ops shell   |
| T08  | BLOCKED               | Chờ D-04 SLA/escalation và D-05 unit/service-area              |
| T09  | ANDROID EMULATOR PASS | UAT-01..04 xong; physical/iOS và production config còn pending |
| T10+ | TODO                  | Theo thứ tự/phụ thuộc trong README và từng execution plan      |

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
- SOS public contract lấy idempotency key từ header. Incident, initial history,
  audit, `incident.received.v1` và stored 202 response commit cùng transaction;
  concurrent retry chỉ tạo một incident.
- Accepted SOS không gọi VietMap, RabbitMQ hoặc notification. Relay dùng
  publisher port, advisory lock và at-least-once retry; lỗi publish để outbox
  pending với error code không chứa provider detail.
- Ops incident feed có monotonic cursor và recheck area/actual data class;
  public tracking chỉ trả projection tổng quát. Accepted payload được DB trigger
  bảo vệ khỏi overwrite.
- Metrics chỉ có aggregate accepted/replayed/failure/duration, không gắn incident,
  public code, tọa độ hoặc identity label.
- Mobile SOS persist vào device-only keychain trước khi gửi, giữ UUID idempotency
  qua restart, single-flight double action và chỉ hiện code sau validated 202 ACK.
- Reconnect chỉ tự retry network/5xx; rejected/invalid ACK được giữ nhưng không
  resend vô hạn. Analytics chỉ phát tên event, không mang payload/toạ độ/code.
- Mobile screen có confirm, stale/low-accuracy guidance, explicit receipt rail và
  `tel:112/113/114/115`. React Native 0.73 shell có Android/iOS permission config;
  Android emulator UAT-01..04 và Dialer intent pass nhưng đây chưa phải release.
- Native release fail closed: `com.atgtlamdong.dev` và local HTTP endpoint chỉ hoạt
  động trong debug; release thiếu approved application ID, HTTPS endpoint và
  signing chỉ hiển thị trạng thái chưa gửi cùng bốn số gọi khẩn cấp.

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

## Bước tiếp theo đề xuất: physical/iOS gate T09 hoặc decision gate T08

T08 không được bắt đầu phần SLA/assignment production cho tới khi có quyết định
D-04 và D-05. Nếu chủ dự án cung cấp SLA/escalation, capability catalog và
service-area GeoJSON đã duyệt, đọc `docs/plans/T08-dispatch-sla.md` rồi viết
execution plan trước code.

T09 Android shell và debug APK đã build trên Windows bằng JDK 20/Android SDK 34.
Pixel 6 Android 14 emulator đã pass UAT-01..04 với API synthetic local, gồm
permission precise/approximate/deny, airplane-mode reconnect, double action và
`tel:112` Dialer intent. Bước kế tiếp là physical Android network/call UAT và iOS
build/UAT trên macOS. Trước release cần approved application ID, HTTPS API endpoint
và signing; không tự suy đoán các giá trị này. D-09 vẫn khóa media/load.

## Kiểm chứng và lệnh chuẩn

Lần kiểm chứng T07 local (2026-08-17): cold start volume rỗng lên đủ 8 service;
migration 07 tạo feed cursor/immutability trigger và seed 6 incident types. 144
unit/contract tests có coverage, 42 API integration và 3 worker integration
tests pass. HTTP smoke với `VIETMAP_USE_FAKE_ADAPTER=false` xác nhận accept/replay/
tracking/metrics; OpenAPI drift, build 12 tasks và 3 visual viewport đều pass.
Commit/CI chính thức được lưu trên nhánh `main` và lịch sử GitHub Actions.

T09 hiện có 36 mobile tests qua 9 suite cho encrypted-store/native-shell boundary,
exact 202 contract, offline/reconnect, double action, restart, location quality,
permission denial, queue concurrency, accessibility và release configuration
block. Android autolink nhận đủ geolocation/NetInfo/keychain/random-values; debug
APK build pass tại `android/app/build/outputs/apk/debug/app-debug.apk`. Android
emulator evidence cho UAT-01..04 được ghi tại `docs/uat/uat-scenarios.md`; hai lỗi
thực tế được sửa là debug host alias `10.0.2.2` cần opt-in riêng và Android coarse
location phải được chấp nhận như approximate. Native integration nền đã publish
tại commit `2b54b57`; kết quả commit/CI của vòng UAT xem progress log T09.

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

## Rollback T07

Tắt `SOS_INGEST_ENABLED=false` và `OUTBOX_RELAY_ENABLED=false`, sau đó rollback
ops web/worker/API theo thứ tự ngược deploy. Giữ migration 07 dormant: không drop
`feed_sequence`, trigger, accepted incident, status history, audit, outbox hoặc
idempotency response. Relay là at-least-once nên consumer tiếp theo vẫn phải dùng
inbox dedupe. Không sửa/xóa bản ghi SOS đã được server acknowledgement.

## Rollback T05

T05 không có database migration. Roll back API module registration và package
changes cùng một release. Giữ `VIETMAP_USE_FAKE_ADAPTER=true` ở local/test; ở
production/pilot chưa duyệt D-03, provider-backed feature phải unavailable, không
được thay bằng dữ liệu fake.
