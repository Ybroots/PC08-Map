# ATGT Platform - Ban do so va ung dung an toan giao thong tinh Lam Dong

> **Phiên bản**: 0.0.1 — T00 đến T07 hoàn thành; T09 Android shell build pass, device UAT còn chờ
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
# Yeu cau: Node >= 20, pnpm >= 9, Docker

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
  module và Android debug APK build pass. Application ID
  `com.atgtlamdong.dev` chỉ dành cho development, không phải ID production.
- Release chưa có approved bundle ID/API endpoint/signing nên chủ động fail closed
  sang màn hình gọi `112/113/114/115`; simulator/device UAT và iOS build trên macOS
  vẫn là gate bắt buộc, không gọi debug APK là native release.

## Backlog trien khai (Codex tasks)

| Task | Ten                                     | Phu thuoc             | Trang thai                         |
| ---- | --------------------------------------- | --------------------- | ---------------------------------- |
| T00  | Khởi tạo repository và chuẩn chất lượng | ADR stack tham chiếu  | DONE                               |
| T01  | Local development infrastructure        | T00                   | DONE                               |
| T02  | Contract và error platform              | T00-T01               | DONE                               |
| T03  | Identity và authorization nền           | T02 + mock IdP local  | DONE                               |
| T04  | Nen tang du lieu va PostGIS             | T01-T03               | DONE                               |
| T05  | VietMap Adapter                         | T02 + VietMap sandbox | SAFE FOUNDATION / D-03 BLOCKED     |
| T06  | Map data lifecycle                      | T03-T04               | DONE                               |
| T07  | SOS incident vertical slice             | T02-T04               | DONE                               |
| T08  | Dispatch engine va SLA                  | T05+T07+SLA rules     | BLOCKED D-04/D-05                  |
| T09  | Citizen mobile SOS                      | T07 + UI prototype    | ANDROID BUILD / DEVICE UAT PENDING |
| T10  | Evidence pipeline                       | T04 + S3/AV decision  | TODO                               |
| T11  | Citizen reports va chong lam dung       | T09-T10               | TODO                               |
| T12  | Privacy vault va break-glass            | T03-T04 + quy che     | TODO                               |
| T13  | Canh bao giao thong                     | T05-T06               | TODO                               |
| T14  | Ops workspace hoan chinh                | T07-T10               | TODO                               |
| T15  | Notifications va contact fallback       | T02-T03 + provider    | TODO                               |
| T16  | Audit, KPI va dashboard lanh dao        | T04 + core flows      | TODO                               |
| T17  | Production infrastructure as code       | T00-T16 + ha tang cap | TODO                               |
| T18  | Security hardening va release candidate | Feature complete      | TODO                               |
| T19  | Performance, HA/DR va chaos rehearsal   | T17-T18               | TODO                               |
| T20  | UAT, pilot release va rollback          | T18-T19 + legal gates | TODO                               |

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
