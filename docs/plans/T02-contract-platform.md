# T02 - Contract và error platform

## Outcome

API có contract thực thi được từ một nguồn Zod duy nhất: runtime validation,
kiểu TypeScript và OpenAPI được giữ đồng bộ. Mọi request có correlation context,
lỗi dùng Problem Details an toàn, và POST có hạ tầng idempotency dùng PostgreSQL.

## Source requirements

- Kế hoạch nguồn, mục T02: OpenAPI, Problem Details, request/trace ID,
  idempotency và event envelope v1.
- Quy tắc repository: stable error code, không lộ stack/secret, retried POST và
  consumer phải idempotent.
- ADR-001: modular monolith và public contract giữa các module.
- ADR-006: transactional outbox và idempotent consumer.
- D-01: dùng reference stack nhưng chưa tuyên bố production-ready.
- D-03: VietMap vẫn dùng fake adapter; contract không gọi provider thật.

## Current state

- `packages/contracts` chứa strict Zod schemas và các type suy ra cho Problem
  Details, idempotency key, provider quality, event envelope v1 và SOS contract.
- OpenAPI 3.1 được sinh tại `packages/contracts/openapi/openapi.json`; drift check
  sinh lại artifact và fail nếu Git diff thay đổi.
- API middleware tạo/kiểm tra `x-request-id` và W3C `traceparent`, rồi trả
  `x-request-id`/`x-trace-id` trong response.
- Global exception filter trả `application/problem+json` với `error_code` ổn định,
  `trace_id` và detail đã làm sạch.
- Zod pipe là boundary validation; API không phụ thuộc `class-validator`.
- Idempotency executor dùng canonical JSON SHA-256 và store abstraction. Có
  in-memory adapter cho unit test và PostgreSQL adapter cho runtime/integration.
- API và worker nạp `packages/config` trước bootstrap; config thiếu/sai hoặc tính
  năng nhạy cảm chưa được phê duyệt sẽ dừng tiến trình.

## Change map

| Area             | Files                                           | Change                                                       | Risk control                                          |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| Contracts        | `packages/contracts/src`, `scripts`, `openapi`  | Zod runtime schemas, TS types, OpenAPI generator/drift check | Strict schemas and contract tests                     |
| Request platform | `apps/api/src/platform`                         | Correlation context, safe Problem Details, Zod pipe          | Invalid external IDs are replaced; no stack output    |
| Idempotency      | `apps/api/src/platform/idempotency`             | Claim, replay, conflict, in-progress, release on failure     | Request hash and PostgreSQL state constraint          |
| Persistence      | `infra/compose/postgres/03-platform-tables.sql` | PROCESSING/COMPLETED lifecycle                               | Forward-compatible nullable response while processing |
| Config           | `packages/config`, API/worker entrypoints       | Typed fail-closed bootstrap                                  | Secrets are not included in validation messages       |
| CI               | `.github/workflows/ci.yml`                      | Contract drift and cold-start integration jobs               | Frozen lockfile and guaranteed Compose cleanup        |

## Test plan and evidence

- Contract: strict schema parsing, coordinate finite/range rules, Problem Details,
  event envelope and SOS schema.
- Unit/API: duplicate key replay, same key/different body conflict, concurrent
  in-progress rejection, failed handler release, request/trace propagation,
  safe error serialization and Zod rejection.
- Integration: PostgreSQL claim/complete/replay/conflict plus PostGIS, RabbitMQ,
  Redis, MinIO and fake seed smoke checks after a cold start.
- Runtime smoke: `/api/v1/health/live` returns 200 with request/trace headers;
  an unknown route returns 404 `application/problem+json` without internals.
- Gates: frozen install, format, lint, typecheck, unit, contract, integration and
  build must all pass before handoff.

## Rollout and rollback

- No feature flag is needed for the platform module; business endpoints adopt the
  exported Zod schemas and `IdempotencyExecutor` incrementally.
- Database change is safe before application rollout: existing rows remain
  readable; new processing state prevents replaying incomplete responses.
- Deploy order: database migration, shared packages, API/worker, then clients.
- Rollback application code first. Do not delete idempotency rows; retain them to
  preserve replay guarantees. Local Compose data can be recreated from fake seed.

## Definition of done

- [x] Error-code registry and RFC Problem Details schema.
- [x] Request/trace correlation and safe global error filter.
- [x] Idempotency abstraction plus PostgreSQL adapter.
- [x] Event envelope v1.
- [x] OpenAPI generation and drift check in CI.
- [x] Duplicate/replay/conflict/concurrency/failure tests.
- [x] No stack or secret in error responses.
- [x] API runtime smoke and cold-start integration smoke.
- [x] Full repository gates pass.

## Progress log

- [x] T00 repository and quality gates normalized at Git root.
- [x] T01 Compose mounts, cold start and integration smoke validated.
- [x] Config wired fail-closed into API and worker.
- [x] Executable contract and OpenAPI artifact implemented.
- [x] Request/error/idempotency platform implemented and tested.
- [x] CI contract and integration gates added.

## Handoff

T02 supplies platform primitives; it does not implement the SOS business use case.
The documented `/public/sos` operation is the planned T07 consumer of this contract.
Next recommended task is T03 identity/authorization using mock OIDC until D-02 is
approved, followed by T04 data platform.

Remaining risks:

- D-01 still prevents declaring the selected stack production-approved.
- D-02 blocks real staff authentication in T03.
- Idempotency cleanup/retention must remain disabled until D-06 is approved.
