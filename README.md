# ATGT Platform - Ban do so va ung dung an toan giao thong tinh Lam Dong

> **Phiên bản**: 0.0.1 — T00 đến T03 đã hoàn thành
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

## Backlog trien khai (Codex tasks)

| Task | Ten                                     | Phu thuoc             | Trang thai |
| ---- | --------------------------------------- | --------------------- | ---------- |
| T00  | Khởi tạo repository và chuẩn chất lượng | ADR stack tham chiếu  | DONE       |
| T01  | Local development infrastructure        | T00                   | DONE       |
| T02  | Contract và error platform              | T00-T01               | DONE       |
| T03  | Identity và authorization nền           | T02 + mock IdP local  | DONE       |
| T04  | Nen tang du lieu va PostGIS             | T01-T03               | TODO       |
| T05  | VietMap Adapter                         | T02 + VietMap sandbox | TODO       |
| T06  | Map data lifecycle                      | T03-T04               | TODO       |
| T07  | SOS incident vertical slice             | T02-T04               | TODO       |
| T08  | Dispatch engine va SLA                  | T05+T07+SLA rules     | TODO       |
| T09  | Citizen mobile SOS                      | T07 + UI prototype    | TODO       |
| T10  | Evidence pipeline                       | T04 + S3/AV decision  | TODO       |
| T11  | Citizen reports va chong lam dung       | T09-T10               | TODO       |
| T12  | Privacy vault va break-glass            | T03-T04 + quy che     | TODO       |
| T13  | Canh bao giao thong                     | T05-T06               | TODO       |
| T14  | Ops workspace hoan chinh                | T07-T10               | TODO       |
| T15  | Notifications va contact fallback       | T02-T03 + provider    | TODO       |
| T16  | Audit, KPI va dashboard lanh dao        | T04 + core flows      | TODO       |
| T17  | Production infrastructure as code       | T00-T16 + ha tang cap | TODO       |
| T18  | Security hardening va release candidate | Feature complete      | TODO       |
| T19  | Performance, HA/DR va chaos rehearsal   | T17-T18               | TODO       |
| T20  | UAT, pilot release va rollback          | T18-T19 + legal gates | TODO       |

## Diem dung bat buoc (khong tu suy doan)

- SLA xac nhan/chuyen cap: **chua chot**
- Vung phuc vu/nang luc don vi: **chua chot**
- Thoi han luu du lieu theo loai: **chua chot**
- Quyen go an danh: **chua chot**
- Hop dong/quota/key VietMap: **chua chot**
- Cap do ATTT: **chua chot**
- Kenh thong bao va nha cung cap: **chua chot**

## Tai lieu lien quan

- `docs/adr/` - 10 Architecture Decision Records
- `docs/plans/T00-T20` - Execution plans cho tung task
- `docs/security/threat-model.md` - Threat model
- `docs/data/data-dictionary.md` - Data dictionary
- `docs/uat/uat-scenarios.md` - UAT-01 den UAT-30
- `docs/runbooks/` - RB-01 den RB-15
- `AGENTS.md` - Quy tac cho AI coding agent
