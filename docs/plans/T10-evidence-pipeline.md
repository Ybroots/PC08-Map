# T10 - Evidence pipeline

## Outcome

Xây nền chain-of-custody thực thi được cho bằng chứng: upload do server cấp ID và
object key ngẫu nhiên, luôn bắt đầu trong quarantine, finalize ghi scan request
atomically với outbox, worker xử lý idempotent và chỉ tạo bản ghi READY sau khi
type/size/hash/AV/derivative đều pass. Original và checksum không thể bị sửa; mọi
preview/download sau này phải qua policy và audit.

T10 được chia hai checkpoint. T10A triển khai contract, migration, lifecycle,
configuration và test foundation. T10B mới nối S3-compatible adapter, AV adapter,
derivative/controlled download và UAT-11..14. Không gọi T10 DONE sau T10A.

## Source requirements

- Source Section 7.1/7.2: initiate/finalize; server tạo object key; quarantine;
  idempotent POST và public response tối thiểu.
- Section 7.3: `evidence.scan_requested.v1` và `evidence.ready.v1` qua outbox/inbox.
- Section 10.2: magic bytes, SHA-256, AV, EXIF-stripped derivative, watermark,
  controlled short-lived URL, audit và legal hold.
- UAT-11..14: file hợp lệ, malware quarantine, EXIF stripped, unauthorized read.
- ADR-005: Quarantine -> Scan -> immutable Original -> Derivative.
- ADR-004/006: không lưu citizen technical identity trong business schema; state
  change + event atomic; consumer idempotent.

## Current state

- Local Compose có ba bucket private `atgt-quarantine`,
  `atgt-evidence-original`, `atgt-evidence-derivative`; chưa có application
  object-storage adapter hoặc media worker.
- `evidence` schema đã tồn tại nhưng chưa có table. Platform đã có transaction,
  outbox/inbox, audit append-only, stable Problem Details và config parser.
- Event routing keys evidence đã được đặt tên nhưng chưa có typed payload schema.
- T09 gửi text/toạ độ trước; `mediaChecksum` vẫn `null` và không tuyên bố upload.

## Decisions and blockers

- D-06 pending: lưu `retention_policy_version=PENDING`, legal hold tồn tại nhưng
  không có archive/delete job và không tự đặt thời hạn.
- D-09 pending: không có mặc định media size/load/poll/batch. Khi bật pipeline,
  deployment phải cung cấp explicit max bytes, MIME allowlist, URL TTL, worker
  poll và batch. Test dùng giá trị fixture có tên, không phải production policy.
- S3/AV production provider chưa duyệt: adapter thật và feature flag production
  vẫn configuration-blocked. Local/test chỉ được dùng adapter được đánh dấu fake
  hoặc S3-compatible synthetic, không tuyên bố production readiness.
- Citizen session có thể xác thực upload nhưng session/token/IP/device không được
  ghi vào `evidence` business tables. Upload capability chỉ lưu dạng SHA-256.
- Không expose/log object key, signed URL, checksum gốc hoặc scan detail.

## Change map

| Area       | Files                                             | Change                                         | Risk                        |
| ---------- | ------------------------------------------------- | ---------------------------------------------- | --------------------------- |
| Contract   | `packages/contracts/src/evidence`, OpenAPI/events | initiate/finalize/status và typed event data   | key/checksum leakage        |
| Data       | `infra/compose/postgres/08-evidence-pipeline.sql` | upload/object/scan history, immutable triggers | chain-of-custody overwrite  |
| Domain     | `packages/domain/src/evidence`                    | deterministic lifecycle/invariants             | invalid READY transition    |
| Config     | `packages/config`                                 | disabled default; explicit values when enabled | unsafe implicit policy      |
| API/worker | `apps/api/modules/evidence`, `apps/worker/media`  | ports, application use cases and adapters      | provider outage/readability |
| Docs/tests | runbook, dictionary, UAT, handoff                 | negative/security/integration evidence         | false completion claim      |

## Implementation sequence

1. T10A: executable contracts/events, expand-only migration and DB immutability.
2. T10A: pure lifecycle and fail-closed configuration with deterministic tests.
3. T10B: initiate/finalize application service + S3-compatible quarantine port.
4. T10B: idempotent media worker, magic/hash/AV, immutable original and derivative.
5. T10B: scoped preview/download authorization, audit, observability and UAT.

## Test plan

- Unit/domain: only legal transitions; hash/mime/size facts cannot change; READY
  requires scan pass + original + derivative.
- Integration: DDL/check constraints, append-only scan history, immutable object,
  state/outbox atomicity and duplicate worker claim.
- Contract: object key never appears in public schemas/events; OpenAPI drift.
- T10B security: EICAR, spoofed MIME, hash mismatch, malicious/unsupported archive,
  provider failure, worker retry, unauthorized preview/download and object tamper.
- Retention: no delete/archive path while D-06 is pending; legal hold defaults safe.

## Rollout and rollback

- `EVIDENCE_PIPELINE_ENABLED=false` by default. Enabling requires every deployment
  parameter and an allowed adapter; staging/production reject fake AV/storage.
- Migration is expand-only. Rollback API/worker code but retain quarantine,
  original, history, checksum and pending outbox/inbox records.
- Deploy order: migration -> API initiate/finalize -> media worker -> viewer.

## Definition of done

- [x] T10A contracts/events/migration/domain/config and deterministic tests pass.
- [ ] Initiate/finalize use server key and quarantine only.
- [ ] Worker validates magic/size/hash/AV and retries idempotently.
- [ ] Original immutable; derivative strips EXIF and carries internal watermark.
- [ ] Scoped preview/download is short-lived and audit logged; no URL/key in logs.
- [ ] UAT-11..14 and full repository/CI gates pass.

## Progress log

- [x] 2026-08-17: inspected source, ADR-004/005/006, existing infra/config/outbox.
- [x] 2026-08-17: split safe T10A foundation from provider-dependent T10B; D-06
      and D-09 boundaries documented without invented values.
- [x] 2026-08-17: added executable upload/event contracts, migration 08,
      deterministic lifecycle, fail-closed config and original bucket versioning.
- [x] 2026-08-17: focused checks pass: 21 contract, 39 domain, 17 config and 3
      PostgreSQL evidence integration tests.
- [x] 2026-08-17: full frozen-install, format, lint, typecheck, unit, coverage,
      contract, integration, e2e and build gates pass locally. Compose config and
      MinIO original-bucket versioning were also verified.

## Handoff

- Changed files: evidence contracts/OpenAPI, migration, domain/config tests,
  Compose versioning, integration test and roadmap/runbook/handoff.
- Tests run/results: focused T10A suites and all local repository gates pass;
  clean-runner cold-start CI pending.
- Remaining risks: provider decision, media limits, AV/CDR behavior, physical UAT.
- Rollback: keep all evidence rows/objects; disable feature and worker.
