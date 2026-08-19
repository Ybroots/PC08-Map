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
| T10  | T10B3 VIEWER PASS     | Local controlled viewer xong; production/UAT còn bị khóa       |
| T11  | T11B2B1 LOCAL PASS    | Exact-hash screening worker; abuse/heuristics vẫn bị khóa      |
| T12  | BLOCKED               | Chờ D-06 retention/legal hold và D-07 break-glass              |
| T13  | T13A LOCAL PASS       | Published bbox alert projection; T13B chờ D-03/D-09            |
| T14  | T14A LOCAL PASS       | Read-only resume workspace; live/dispatch chờ D-02/04/05/09    |
| T15+ | TODO                  | Theo thứ tự/phụ thuộc trong README và từng execution plan      |

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
- Evidence T10B1 có citizen-session-protected initiate/finalize runtime, replay-safe
  idempotency, server-generated quarantine key và HMAC capability chỉ lưu hash.
  MinIO adapter signed PUT/HEAD chạy ngoài transaction; finalize atomically ghi
  state/history/audit/outbox. Event không mang object key/URL/checksum.
- Evidence T10B2 consume đúng `evidence.scan_requested.v1`, giữ advisory lease,
  bounded-read quarantine, kiểm tra exact size/SHA-256/magic, fake EICAR AV và tạo
  PNG watermarked đã loại EXIF. Conditional puts giữ original/derivative bất biến;
  inbox + READY/history/audit/ready-event được commit atomically.
- Evidence lifecycle chỉ READY sau exact hash/MIME/size, clean AV và đủ original +
  derivative. Config mặc định disabled, yêu cầu toàn bộ deployment values và chặn
  staging/production cho tới T10B provider approval.
- Evidence T10B3 có preview derivative/download immutable original qua signed GET
  TTL ngắn. Guard và repository cùng kiểm tra dispatcher, area, assigned case và
  actual data class; scope miss trả uniform 404. Access audit/metrics không chứa
  signed URL, object key/checksum hoặc identifier labels. Migration 09 chặn hạ
  classification từ restricted và thêm scoped lookup index.
- Report T11A có strict public contract, citizen-session-protected submit,
  idempotent 202 replay, random public code và generalized tracking. Report,
  initial history, privacy-safe audit, `report.received.v1` outbox và stored
  response commit trong một transaction; event không mang public code, location,
  description hay plate. Rabbit giữ event trong durable `reports.screening` +
  DLQ để consumer T11B có thể triển khai sau mà không mất event đã relay.
- Migration 10 tạo PII-free `report.reports`, category catalog synthetic và
  append-only history. Submitted payload được DB trigger bảo vệ; risk luôn NULL,
  plate luôn `_unverified`, không có auto duplicate/kết luận/enforcement path.
  `REPORT_INTAKE_ENABLED=false` mặc định và bị reject ở staging/production.
- T11B1 thêm report capability HMAC riêng và endpoint gắn evidence. Citizen
  session, report capability và upload capability đều bắt buộc; DB chỉ gắn object
  READY chưa có owner, không cho reassign. Link/audit/`report.evidence_linked.v1`
  outbox commit atomically; raw capability không vào report/audit/outbox.
- T11B2A thêm queue `PENDING_VERIFICATION` theo area/data class với resume cursor
  được cấp đúng lúc report vào queue. Chỉ dispatcher đúng area được quyết định
  VERIFIED/REJECTED/DUPLICATE bằng optimistic version. DUPLICATE bắt buộc confirm
  một candidate đang PENDING; false-positive giữ report trong queue. Candidate,
  audit và `report.verification_decided.v1` hoặc
  `report.duplicate_false_positive.v1` outbox commit atomically. Event không mang
  public code, tọa độ, mô tả, plate, reason hay principal. Hai event lifecycle có
  durable queue + DLQ riêng, không trộn vào consumer screening.
- T11B2B1 thêm consumer idempotent cho `report.received.v1` và
  `report.evidence_linked.v1`. Worker chỉ chuyển RECEIVED -> SCREENING ->
  PENDING_VERIFICATION, rồi tạo suggestion PENDING khi evidence READY có SHA-256
  khớp chính xác với report cũ cùng area. Inbox, history, audit, candidate và
  outbox commit atomically; overflow hoặc persisted-event mismatch rollback toàn
  bộ. Không dùng time/space/plate, không ghi risk score và không tự kết luận
  DUPLICATE/VERIFIED/REJECTED.
- T13A thêm public bbox/vehicle alert projection độc lập từ map module. Repository
  chỉ đọc latest current public/PUBLISHED version của allowlisted layer, kiểm tra
  hiệu lực, validate strict `properties.alert`, rồi trả allowlisted warning/action/
  priority/source/version. Invalid source hoặc overflow fail closed; response ghi
  rõ `BBOX_ONLY` và không gọi provider.
- T14A thêm contract feed client và pure resume model: cursor không được lùi,
  overlapping page dedupe, queue lấy projection mới nhất, stale/auth/network/
  contract failure không xóa dữ liệu đã validate. Navigation dùng shared policy.
  Ops UI vẫn explicit synthetic/read-only, không poll, không giữ bearer và không
  mở assignment/SLA.

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

## Bước tiếp theo đề xuất sau T14A: T15 safe notification contracts

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

T10B3 đã hoàn tất controlled preview/download backend trên local PostgreSQL/MinIO.
Để gọi T10 DONE vẫn cần approved storage/secret resolver/real AV, D-09 media/load
profile, malware alert workflow và end-user UAT-11..14. Khi chưa có các quyết định
này, giữ `EVIDENCE_PIPELINE_ENABLED=false`; không dựng fake production, không đánh
dấu pilot UAT pass và không thêm retention delete khi D-06 còn pending.

T11B2B1 local/test đã hoàn tất consumer chuyển RECEIVED -> SCREENING ->
PENDING_VERIFICATION và exact-hash suggestion. `REPORT_SCREENING_WORKER_ENABLED`
mặc định false, bị reject ở staging/production và khi bật phải truyền rõ poll,
batch, max-candidate technical bounds. Lát cắt tiếp theo là T11B2B2 risk/rate-
limit/captcha ports và producer time/space/plate. Phần này vẫn bị khóa bởi D-09:
không tự điền threshold, rate, window hay score. Mọi heuristic chỉ được tạo
suggestion; operator vẫn là nơi duy nhất kết luận. Production tiếp tục fail-closed
cho đến khi T09/T10 provider/UAT/D-09 gates được duyệt.

T12 không được tạo identity collection, retention hoặc break-glass workflow khi
D-06/D-07 còn pending. T13A chỉ là nền public bbox từ dữ liệu đã duyệt; giữ
`TRAFFIC_ALERTS_ENABLED=false` ngoài local/test và không mô tả là route-aware.
T13B proximity/direction/cooldown vẫn bị khóa bởi D-03/D-09. Sau khi T13A full
gate/cold-start/CI xanh, lát cắt khả thi kế tiếp là rà plan T14 và triển khai phần
ops workspace không phụ thuộc SLA/provider/policy chưa duyệt.

T14A chỉ hoàn thành read-only UX foundation. Live OIDC/session wiring chờ D-02;
assignment/SLA/service area chờ D-04/D-05; realtime cadence/load chờ D-09. Không
đổi synthetic shell thành live bằng cách hard-code bearer hoặc poll interval.
Sau full gate/CI T14A, rà T15 để tách phần executable notification contracts/ports
khỏi provider/channel selection D-08; runtime delivery vẫn phải fail closed.

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
tại commit `2b54b57`; UAT fixes/evidence đã publish tại `8cc7e88`. GitHub CI run
`32002194610` xanh đủ sáu job gồm secret scan, static gates, contract drift, unit,
cold-start integration và build. Full local frozen-install, format/lint/typecheck,
unit/coverage/contract/integration/e2e/build và Android `assembleDebug` cũng pass.

T10A focused verification có 21 contract tests, 39 domain tests, 17 config tests
và 3 PostgreSQL evidence integration tests. Migration 08 đã được áp dụng lên local
DB hiện tại; MinIO initializer xác nhận ba bucket private và original versioning.
Full local frozen-install, format/lint/typecheck, unit/coverage/contract,
integration/e2e và build đều pass; API integration hiện có 45 test, worker có 3.
T10A implementation ở commit `8f4ca18`; cold-start phát hiện migration 08 chưa
được mount nên thứ tự init đã sửa tại `979b755` thành migration 08 rồi seed 09.
GitHub CI run `32004958414` xanh đủ sáu job, gồm secret/static/contract/unit,
cold-start integration từ volume rỗng và build toàn workspace.
T10B1 focused verification hiện có 57 API unit tests và 46 API integration tests;
runtime integration thực hiện signed PUT thật vào quarantine, replay initiate/
finalize và xác nhận đúng một scan-request event. Full local frozen-install,
format/lint/typecheck, unit/coverage/contract/integration/e2e/build đều pass.
Runtime ở commit `72b334e`; clean-runner phát hiện test dùng timestamp cố định
trước `created_at` của PostgreSQL nên smoke clock đã sửa tại `3655aff`. GitHub CI
run `32007748446` xanh đủ sáu job, gồm cold-start PostgreSQL/MinIO và signed PUT
integration. Xem
`docs/plans/T10-evidence-pipeline.md` để tiếp tục controlled viewer mà không vượt hard
stop.

T10B2 verification (2026-08-19) có 13 worker unit tests và 2 real PostgreSQL/MinIO
media integration tests: clean JPEG + duplicate event tạo đúng một version
original, derivative PNG không EXIF; EICAR bị REJECTED và không tạo object đọc
được. Full frozen-install, format/lint/typecheck, unit/coverage, contract, e2e và
build đều pass. Cold-start từ volume rỗng dựng 8 service healthy, Rabbit chỉ bind
scan-request, seed có 6 incident type; API integration 46/46 và worker integration
5/5 pass. Implementation ở commit `428cc91`; GitHub CI run `32217478741` xanh đủ
6/6 gồm secret, quality, contract, coverage, cold-start integration và build.

T10B3 verification (2026-08-19) có executable preview/download OpenAPI contract,
66 API unit tests và real PostgreSQL/MinIO access integration: authorized preview
đọc derivative, download đọc original, wrong-case/actual restricted data bị uniform
deny và audit không chứa URL/key/hash. Cold-start đã xóa đúng các volume synthetic
`atgt-*`, dựng lại 8 service healthy, áp migration 09 rồi seed; API integration
47/47 và worker integration 5/5 pass. Full frozen-install, format/lint/typecheck,
unit/coverage/contract/e2e/build pass. Full integration còn phát hiện host clock
chậm hơn PostgreSQL; finalize timestamp giờ được clamp theo persisted `created_at`
và có regression fixture -1 giây. Implementation ở commit `1544b1a`; GitHub CI
run `32219225891` xanh đủ 6/6 job, gồm secret scan, static gates, contract drift,
coverage, cold-start integration và build.

T11A verification (2026-08-19) có executable report submit/accepted/tracking và
`report.received.v1` contracts, 54 domain tests, 24 contract tests, 18 config
tests và 68 API unit tests. Cold-start đã xóa đúng 6 volume synthetic `atgt-*`,
chạy migration 10 trước seed 11, dựng 8 service healthy và khởi tạo 3 MinIO bucket
private. Non-cached integration pass API 56/56 + worker 5/5; HTTP test xác nhận
missing session 401, anonymous session -> 202, exact replay và tracking tối giản.
Full format/lint/typecheck/unit/coverage/contract/e2e/build đều pass. Production
intake vẫn bị config reject; xem `docs/plans/T11-citizen-reports.md` để tiếp tục
T11B mà không suy đoán D-09. Implementation ở commit `4541c9b`; GitHub CI run
`32221632793` xanh đủ 6/6 job.

T11B1 verification (2026-08-19) có capability-protected READY evidence link,
atomic owner/audit/`report.evidence_linked.v1` outbox và exact replay không phát
event lần hai. Contract có 25 test, config 19 test, API unit 72 test. Cold-start
đã xóa đúng 6 volume synthetic `atgt-*`, chạy migration 11 trước seed 12, dựng 8
service healthy và 3 MinIO bucket private/versioned; non-cached integration pass
API 59/59 + worker 5/5. HTTP test xác nhận thiếu citizen session bị 401, đủ hai
capability + READY thì link 200 và report vẫn RECEIVED. Production linking/intake
vẫn fail-closed; T11B2 không được tự đặt threshold khi D-09 còn pending.
Implementation ở commit `2b72255`; GitHub CI run `32223513120` xanh đủ 6/6 job.

T11B2A verification (2026-08-19) có executable OpenAPI cho queue/decision/override,
26 contract tests, 26 authorization tests và 73 API unit tests. Cold-start đã xóa
đúng 6 volume synthetic `atgt-*`, chạy migration 12 trước seed 13, dựng 8 service
healthy, 3 MinIO bucket private/versioned và durable `reports.lifecycle` + DLQ.
Non-cached integration pass API 65/65 + worker 5/5. Integration xác nhận cross-area
và non-dispatcher bị deny, cursor không bỏ sót report cũ vừa vào queue, false-positive
không kết luận report, confirm DUPLICATE kiểm tra cả report/candidate version, và
audit/outbox atomic không lộ dữ liệu nhạy cảm. Full frozen-install, format/lint/
typecheck/unit/coverage/contract/e2e/build đều pass. Automatic screening/candidate
generation và abuse controls vẫn blocked bởi D-09; production vẫn fail-closed.
Implementation ở commit `4fedd92`; GitHub CI run `32228563065` xanh đủ 6/6 job.

T11B2B1 local verification (2026-08-19) có strict received/evidence-linked input
events và privacy-safe screening-completed/exact-hash-candidate output events,
20 config tests, 27 contract tests và 16 worker unit tests. Cold-start đã xóa đúng
6 volume synthetic `atgt-*`, chạy migration 13 trước seed 14, dựng 8 service,
3 MinIO bucket private/original versioned và exact-hash index + hai lifecycle
Rabbit bindings. Non-cached integration pass API 66/66 + worker 9/9. Integration
xác nhận idempotent RECEIVED -> SCREENING -> PENDING_VERIFICATION, exact READY-
evidence SHA suggestion không lộ checksum, persisted-event mismatch và candidate
overflow rollback toàn transaction. Full frozen-install, format/lint/typecheck,
unit/coverage/contract/e2e/build đều pass. Worker vẫn disabled mặc định và bị
reject ở staging/production; risk/rate/captcha/time/space/plate vẫn blocked bởi
D-09. Implementation ở commit `fd6ba56`; GitHub CI run `32230392483` xanh đủ
6/6 job.

T13A local verification (2026-08-19) có strict bbox/vehicle OpenAPI contract,
fail-closed local/test config và independent alert read model chỉ dùng latest
current public/PUBLISHED map version. Response allowlist ghi rõ `BBOX_ONLY`; invalid
nested source và candidate/result overflow đều reject. Synthetic layer schema cũng
strict ở import boundary. Final cold-start đã xóa đúng 6 volume synthetic `atgt-*`,
dựng 8 service healthy và 3 MinIO bucket private/versioned; non-cached integration
pass API 70/70 + worker 9/9. Full frozen-install, format/lint/typecheck/unit/coverage/
contract/e2e/build đều pass. Cold-run còn bắt được microsecond clock skew ở T11B2A;
report decision giờ clamp bằng PostgreSQL `GREATEST` và regression `new Date(0)`
pass. T13B route/direction/cooldown và production enable vẫn blocked D-03/D-09.
Clock invariant fix ở commit `cd4c67e`; T13A implementation ở `34cf2e4`;
GitHub CI run `32232926639` xanh đủ 6/6 job.

T14A local verification (2026-08-19) có contract-validated incident feed client,
monotonic resume/dedupe model, explicit stale/auth/network/contract states và
navigation tạo từ shared authorization policy. Ops UI là synthetic read-only
shell, không poll, không lưu bearer, không mở assignment/SLA; desktop 1440x1000
và mobile 390x844 browser smoke pass selection/filter bằng bàn phím, không tràn
ngang, reduced-motion không animation và 0 console error. Có 10/10 focused ops
unit test; full frozen-install, format/lint/typecheck, 283 unit tests + coverage,
contract/e2e/build đều pass. Không chạy cold-start vì lát cắt không đổi API, DB,
migration hay infra. Production/live vẫn bị khóa bởi D-02/D-04/D-05/D-09.
Implementation commit và GitHub CI sẽ được ghi sau khi publish.

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
