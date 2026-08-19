# ATGT Platform - Ban do so va ung dung an toan giao thong tinh Lam Dong

> **Phiên bản**: 0.0.1 — T00 đến T07 hoàn thành; T09 Android emulator pass; T10B3 controlled viewer local/test
> **Nguon tai lieu**: Ke_hoach_trien_khai_Code_Codex_ATGT_Lam_Dong.docx (v1.0, 16/08/2026)

## Gioi thieu

Nen tang so tiep nhan, xac minh, dieu phoi va theo doi su kien giao thong theo vi tri; quan tri lop du lieu giao thong va tich hop VietMap qua Adapter tap trung. Phuc vu nam nhom: cong dan/du khach, truc ban, don vi dia ban, lanh dao va quan tri he thong.

## Luan co cot loi

| Luong          | Mo ta                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| SOS            | Tu cong dan den trung tam chi huy; goi y don vi theo vung; theo doi cac moc tu tiep nhan den hoan tat |
| Phan anh       | Vi pham co toa do va bang chung; chong spam/trung; che dinh danh; xac minh truoc khi dung nghiep vu   |
| Du lieu ban do | Quan tri va cong bo duong cam/diem nguy hiem/bai do/cam dung/cam do va su kien tam thoi               |

## Cấu trúc monorepo

```
repository-root/
  AGENTS.md              # Quy tac cho Codex/AI agent
  PLANS.md               # Mau execution plan
  apps/
    api/                 # NestJS modular monolith
    worker/              # Background jobs
    citizen-mobile/      # React Native
    citizen-web/         # Next.js public/PWA
    ops-web/             # Next.js dieu hanh
  packages/
    contracts/           # DTO, OpenAPI, event schemas
    domain/              # Value objects (no framework)
    authorization/       # Policy engine
    vietmap-client/      # Map provider port + adapter
    observability/       # OTel/logging/metrics
    config/              # Typed config
    test-kit/            # Fixtures, fakes
    ui/                  # Design tokens/components
  infra/
    compose/             # Local dev
    ansible/             # 09 VPS deployment
    edge/                # HAProxy/Nginx/WAF
    postgres/            # Replication/PITR
    rabbitmq/            # Quorum/DLQ config
    redis/               # Sentinel config
    monitoring/          # Prometheus/Grafana/alerts
  docs/
    adr/                 # Architecture Decision Records
    api/                 # API documentation
    data/                # Data dictionary
    plans/               # Task execution plans (T00-T20)
    security/            # Threat model, access control
    runbooks/            # Operational runbooks
    uat/                 # UAT scenarios and evidence
```

## Bắt đầu nhanh (local dev)

```bash
# Yeu cau: Node >= 20.9, pnpm >= 9, Docker

# 1. Tạo cấu hình local (không commit file này)
cp .env.example .env.local

# 2. Khoi dong dich vu
pnpm dev:up

# 3. Cai dependencies
pnpm install --frozen-lockfile

# 4. Chay tat ca kiem tra
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contract
pnpm test:integration
pnpm build
```

`pnpm dev:up` chờ tám service dài hạn healthy và chạy MinIO initializer một lần.
`pnpm dev:reset` chỉ xóa volume thuộc Compose project hiện tại rồi seed lại dữ liệu giả.

## Contract platform

- Zod là nguồn contract runtime và TypeScript trong `packages/contracts/src`.
- OpenAPI 3.1 được sinh tại `packages/contracts/openapi/openapi.json`.
- `pnpm test:contract` kiểm tra schema và OpenAPI drift.
- API trả Problem Details với stable `error_code`, `trace_id`, request correlation
  và có PostgreSQL-backed idempotency cho POST retry.
- API/worker kiểm tra toàn bộ cấu hình trước bootstrap và dừng khi cấu hình không an toàn.

## Data platform

- Core DDL nằm trong migration, không nằm trong development seed.
- Incident point lưu bằng generated `geography(Point, 4326)` từ longitude/
  latitude đã được database kiểm tra range; spatial columns có GiST indexes.
- API dùng một managed PostgreSQL pool, transaction manager, transactional
  outbox writer và idempotent inbox claims.
- Incident repository bắt buộc branded `AccessScope`, prefilter area/case và
  đánh giá lại policy role/unit/area/case/data class trước khi trả dữ liệu.
- D-05/D-06/D-07/D-09 vẫn khóa dữ liệu đơn vị thật, retention cleanup,
  break-glass và load tuning.

## VietMap adapter

- `MapProviderPort` chuẩn hóa search/reverse/route/matrix và metadata quality,
  observed time, cache status, API version, provider và latency.
- Local/test dùng fake deterministic qua input allowlist, opaque cache key,
  bounded cache/max-stale/retry và circuit breaker tách theo API.
- Tắt fake không gọi dịch vụ thật: provider call fail-closed trong khi core
  health vẫn hoạt động. Real HTTP adapter/sandbox tests chờ D-03 phê duyệt.

## SOS vertical slice

- `POST /api/v1/public/sos` lấy `Idempotency-Key` từ header và commit incident,
  initial history, audit, outbox cùng stored response trong một transaction.
- Retry đồng thời tạo đúng một incident; cùng payload replay đúng acknowledgement,
  payload khác với cùng key trả stable idempotency conflict.
- Ops feed theo area dùng cursor append-only; repository đánh giá lại actual data
  class và scope. Public tracking chỉ trả trạng thái tổng quát theo ADR-010.
- RabbitMQ relay là at-least-once qua publisher port; publisher lỗi chỉ để outbox
  pending. SOS acknowledgement không gọi VietMap hoặc notification provider.
- Intake area/idempotency TTL và relay poll/batch là config bắt buộc khi bật;
  không có production default trong khi D-05/D-06/D-09 còn pending.

## Citizen mobile SOS foundation

- React Native feature lưu queue versioned trong OS keychain trước khi thử gửi;
  không fallback sang AsyncStorage/plaintext và không tự xóa payload hỏng.
- Mỗi thao tác có client event UUID và `Idempotency-Key` UUID ổn định qua retry/
  restart. Reconnect chỉ tự retry lỗi mạng/5xx; 4xx/contract error được giữ lại
  nhưng không gửi lặp vô hạn.
- UI phân biệt rõ trên thiết bị, đang gửi, server acknowledged và gửi lỗi. Public
  code chỉ xuất hiện sau response `202` hợp lệ theo `SosAcceptedSchema`.
- Permission denied, stale/low-accuracy warning, confirm step và các link
  `tel:112/113/114/115` đã có test accessibility.
- Native React Native 0.73 shell đã có Android/iOS manifests, autolink bốn native
  module, Android debug APK build và Android emulator UAT-01..04 pass. Application ID
  `com.atgtlamdong.dev` chỉ dành cho development, không phải ID production.
- Release chưa có approved bundle ID/API endpoint/signing nên chủ động fail closed
  sang màn hình gọi `112/113/114/115`; physical-device call/network UAT và iOS
  build trên macOS vẫn là gate bắt buộc, không gọi debug APK là native release.

## Evidence pipeline foundation

- T10A có executable initiate/finalize contracts, typed scan/ready events và
  expand-only schema `evidence.uploads/objects/scan_history`.
- Upload declaration/capability hash bất biến; business schema không chứa citizen
  session/token/IP/device identity. App role không được delete evidence hoặc sửa
  scan history; original checksum/storage facts được DB trigger bảo vệ.
- Lifecycle chỉ cho `INITIATED -> SCAN_PENDING -> READY|REJECTED`; READY yêu cầu
  hash/MIME/size/AV/original/derivative facts đều pass. Original MinIO bucket có
  versioning và ba bucket vẫn private.
- T10B1 đã nối runtime initiate/finalize: citizen-session guard, idempotent
  initiation, HMAC capability chỉ lưu hash, server-generated quarantine key,
  MinIO signed PUT + HEAD và atomic scan-request outbox. Integration không lưu
  session/token, raw capability, signed URL hoặc object key trong event.
- T10B2 worker kiểm tra bounded size/SHA-256/magic bytes/fake EICAR, ghi original
  bằng conditional immutable put và tạo PNG watermarked đã loại EXIF. Inbox claim,
  state/history/audit và ready-event được commit atomically; retry không tạo thêm
  original version.
- T10B3 cấp preview derivative hoặc download original bằng signed GET ngắn hạn
  sau khi guard và repository cùng xác nhận role, area, assigned case và actual
  data class. Mỗi lần cấp URL có append-only audit; contract/log/metrics không
  chứa object key, checksum hoặc signed URL. Classification không được hạ từ
  `restricted` về `sensitive`.
- Pipeline mặc định tắt. Local/test phải khai báo MIME/max bytes/upload+read URL TTL/worker
  poll+batch, S3 credentials và fake AV rõ ràng; staging/production bị chặn cho
  tới provider approval. Backend technical evidence cho UAT-11, UAT-13 và UAT-14
  đã có; end-user UAT và malware alert của UAT-12 vẫn chưa hoàn tất.

## Ops workspace foundation

- T14A có contract-validated incident feed client, monotonic resume cursor,
  overlap dedupe, latest-per-incident queue và explicit stale/auth/network/contract
  failure states. Client không lưu hoặc log bearer token.
- Navigation dùng chung `AuthorizationPolicy`; đây chỉ là UX projection, API và
  repository vẫn là enforcement boundary.
- `/incidents` là interactive synthetic/read-only shell với filter, keyboard focus,
  responsive layout và resume rail. Không có poll interval mặc định, assignment,
  SLA hay realtime claim khi D-02/D-04/D-05/D-09 còn pending.

## Notification foundation

- T15A có strict `notification.requested.v1` event: channel duy nhất là
  `INTERNAL`, recipient chỉ là opaque UUID và template bắt buộc có version.
- Citizen template data chỉ nhận `public_code`, trạng thái tổng quát và
  `observed_at`; operational detail, contact endpoint và unknown field bị reject.
- Worker có injected template/preference/claim/provider/audit ports và dispatcher
  idempotent. Duplicate không gửi; optional opt-out được tôn trọng; mandatory class
  chỉ hoạt động khi definition injected khớp chính xác.
- Rate-limit/outage được phân loại retryable; permanent reject không retry. Audit
  không chứa recipient hoặc template data. Chưa có adapter, migration, consumer
  registration hay production template; D-08 vẫn khóa T15B.

## Backlog trien khai (Codex tasks)

| Task | Ten                                     | Phu thuoc             | Trang thai                      |
| ---- | --------------------------------------- | --------------------- | ------------------------------- |
| T00  | Khởi tạo repository và chuẩn chất lượng | ADR stack tham chiếu  | DONE                            |
| T01  | Local development infrastructure        | T00                   | DONE                            |
| T02  | Contract và error platform              | T00-T01               | DONE                            |
| T03  | Identity và authorization nền           | T02 + mock IdP local  | DONE                            |
| T04  | Nen tang du lieu va PostGIS             | T01-T03               | DONE                            |
| T05  | VietMap Adapter                         | T02 + VietMap sandbox | SAFE FOUNDATION / D-03 BLOCKED  |
| T06  | Map data lifecycle                      | T03-T04               | DONE                            |
| T07  | SOS incident vertical slice             | T02-T04               | DONE                            |
| T08  | Dispatch engine va SLA                  | T05+T07+SLA rules     | BLOCKED D-04/D-05               |
| T09  | Citizen mobile SOS                      | T07 + UI prototype    | ANDROID EMULATOR UAT PASS       |
| T10  | Evidence pipeline                       | T04 + S3/AV decision  | T10B3 VIEWER PASS / UAT BLOCKED |
| T11  | Citizen reports va chong lam dung       | T09-T10               | T11B2B1 LOCAL / D-09 BLOCKED    |
| T12  | Privacy vault va break-glass            | T03-T04 + quy che     | BLOCKED D-06/D-07               |
| T13  | Canh bao giao thong                     | T05-T06               | T13A LOCAL / T13B BLOCKED       |
| T14  | Ops workspace hoan chinh                | T07-T10               | T14A LOCAL / T14B BLOCKED       |
| T15  | Notifications va contact fallback       | T02-T03 + provider    | T15A LOCAL / T15B BLOCKED       |
| T16  | Audit, KPI va dashboard lanh dao        | T04 + core flows      | TODO                            |
| T17  | Production infrastructure as code       | T00-T16 + ha tang cap | TODO                            |
| T18  | Security hardening va release candidate | Feature complete      | TODO                            |
| T19  | Performance, HA/DR va chaos rehearsal   | T17-T18               | TODO                            |
| T20  | UAT, pilot release va rollback          | T18-T19 + legal gates | TODO                            |

## Diem dung bat buoc (khong tu suy doan)

- SLA xac nhan/chuyen cap: **chua chot**
- Vung phuc vu/nang luc don vi: **chua chot**
- Thoi han luu du lieu theo loai: **chua chot**
- Quyen go an danh: **chua chot**
- Hop dong/quota/key VietMap: **chua chot**
- Cap do ATTT: **chua chot**
- Kenh thong bao va nha cung cap: **chua chot**

## Tai lieu lien quan

- `docs/HANDOFF.md` - Trạng thái hiện tại và điểm bắt đầu cho người tiếp quản
- `docs/adr/` - 10 Architecture Decision Records
- `docs/plans/T00-T20` - Execution plans cho tung task
- `docs/security/threat-model.md` - Threat model
- `docs/data/data-dictionary.md` - Data dictionary
- `docs/uat/uat-scenarios.md` - UAT-01 den UAT-30
- `docs/runbooks/` - RB-01 den RB-15
- `AGENTS.md` - Quy tac cho AI coding agent
