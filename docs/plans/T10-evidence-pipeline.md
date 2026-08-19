# T10 - Evidence pipeline

## Outcome

Xây nền chain-of-custody thực thi được cho bằng chứng: upload do server cấp ID và
object key ngẫu nhiên, luôn bắt đầu trong quarantine, finalize ghi scan request
atomically với outbox, worker xử lý idempotent và chỉ tạo bản ghi READY sau khi
type/size/hash/AV/derivative đều pass. Original và checksum không thể bị sửa; mọi
preview/download sau này phải qua policy và audit.

T10 được chia thành T10A foundation, T10B1 upload runtime, T10B2 media worker và
T10B3 controlled viewer/UAT. Không gọi T10 DONE trước khi viewer authorization,
production provider gate và UAT-11..14 hoàn tất.

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
  `atgt-evidence-original`, `atgt-evidence-derivative`; T10B1 đã nối S3-compatible
  signed PUT/HEAD adapter cho local/test.
- T10B2 có idempotent RabbitMQ media worker cho JPEG/PNG: bounded read, exact
  size/SHA-256, magic bytes, fake EICAR AV, immutable original và watermarked PNG
  derivative đã auto-orient/loại EXIF. READY/history/audit/ready-event commit cùng
  inbox claim; provider failure được retry và invalid event đi DLQ.
- T10B3 có officer-only preview/download theo area + assigned case + actual data
  class. Preview chỉ ký derivative, download chỉ ký immutable original; URL có TTL
  explicit và mọi lần cấp/deny/provider error đều ghi append-only audit không chứa
  URL, object key hay checksum. Metrics chỉ là aggregate counters.
- `evidence` schema có upload/object/history tables và immutable triggers. Runtime
  initiate/finalize dùng citizen session, idempotency, transaction và outbox.
- Evidence events có typed payload không mang object key/URL/checksum.
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
3. T10B1: initiate/finalize application service + S3-compatible quarantine port.
4. T10B2: idempotent media worker, magic/hash/AV, immutable original và derivative.
5. T10B3: scoped preview/download authorization, audit, observability và UAT.

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
- [x] Initiate/finalize use server key and quarantine only.
- [x] Worker validates magic/size/hash/AV and retries idempotently in local/test.
- [x] Original immutable; derivative strips EXIF and carries internal watermark.
- [x] Scoped preview/download is short-lived and audit logged; no URL/key in logs.
- [ ] End-user UAT-11..14 and production provider/decision gates pass.

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
- [x] 2026-08-17: clean-runner CI exposed the missing migration mount; fixed
      init order to migration 08 then seed 09. CI run `32004958414` passed all
      six jobs, including cold-start/integration from an empty volume.
- [x] 2026-08-17: T10B1 runtime initiate/finalize added with citizen-session
      guard, replay-safe initiation, HMAC capability hash, MinIO signed PUT/HEAD
      and atomic history/outbox. Real PostgreSQL + MinIO integration passes.
- [x] 2026-08-17: clean-runner exposed the smoke test's fixed timestamp preceding
      PostgreSQL `created_at`; the test now uses the runtime clock. Commit
      `3655aff` passed all six jobs in CI run `32007748446`, including cold-start
      PostgreSQL/MinIO integration from empty volumes.
- [x] 2026-08-19: T10B2 added the exact scan-request consumer, PostgreSQL advisory
      lease/inbox transaction, bounded S3 reads, SHA-256/magic checks, fake EICAR
      AV, immutable conditional writes and Sharp EXIF-free watermarked derivative.
      Focused worker unit tests pass 13/13 and real PostgreSQL/MinIO integration
      passes clean-media/idempotency and EICAR rejection scenarios.
- [x] 2026-08-19: T10B3 added executable preview/download contracts, dual guard +
      repository scope recheck, short-lived signed GET, append-only access audit,
      aggregate Prometheus counters and classification downgrade protection.
- [x] 2026-08-19: cold-start from empty `atgt-*` volumes applied migration 09 and
      seeded successfully. API integration passes 47/47 and worker integration
      passes 5/5. A real host/PostgreSQL clock skew exposed finalize timestamp
      coupling; persisted finalize/history/outbox time is now clamped to DB
      `created_at` and covered by a deliberate -1 second regression fixture.

## Handoff

- Changed files: T10B3 access contract/OpenAPI, officer routes, scoped repository,
  access service, S3 signed GET, audit/metrics, migration 09 and integration tests.
- Tests run/results: focused access integration and clock-skew regression pass.
  Full frozen install, format/lint/typecheck, unit/coverage, contract, e2e/build
  pass; cold-start API integration is 47/47 and worker integration is 5/5.
- Remaining risks: production provider/secret resolution, media limits, real AV/CDR,
  malware alert workflow and end-user/physical UAT. Record commit/CI after push.
- Rollback: keep all evidence rows/objects; disable feature and worker.
