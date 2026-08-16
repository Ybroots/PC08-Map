# T05 - VietMap Adapter

## Outcome

Ứng dụng chỉ phụ thuộc `MapProviderPort` cho search/reverse/route/matrix. Mọi
kết quả thành công có provider, API version, `observedAt`, cache status, quality
và latency. Local/test dùng fake deterministic qua cùng resilience boundary.
Khi fake bị tắt, API core vẫn khởi động nhưng provider call fail-closed vì D-03
chưa phê duyệt; không có request nào được gửi đến VietMap thật.

## Source requirements

- T05 nguồn: cô lập search/reverse/route/matrix, quota, cache, circuit breaker và
  telemetry trong `packages/vietmap-client`.
- Mục 8.1-8.3: domain chỉ biết port; provider context không có PII/case note;
  timeout/retry/cache/degradation phải minh bạch và bounded.
- ADR-001: adapter nằm trong modular monolith, không tạo deployable service mới.
- ADR-009: EPSG:4326 với thứ tự `[longitude, latitude]`.
- AGENTS: không gọi provider trong database transaction; VietMap hỏng không làm
  SOS intake hoặc core health hỏng.

## Current state

- T00 đã tạo port và fake adapter tối thiểu nhưng matrix dùng `Math.random`,
  metadata thiếu provider/API/cache/latency và chưa có resilience boundary.
- Typed config có base URL, secret reference, client key alias, timeout, quota
  warning percentage và `VIETMAP_USE_FAKE_ADAPTER`.
- D-03 vẫn `PENDING`; chưa có approved API version, endpoint schema, auth/key
  type, quota, pricing, licensing/cache rules hoặc sandbox fixtures.
- Runbook RB-08 mới là placeholder.

## Decisions and blockers

- D-03 là hard stop. Không implement real HTTP request/response mapping, không
  resolve server secret và không gọi sandbox/production cho đến khi được duyệt.
- T05 hoàn tất phần provider-agnostic và fake-only. Real `HttpVietMapAdapter`,
  recorded contract fixtures, quota header mapping và production cache TTL vẫn
  bị khóa; chúng không được đánh dấu hoàn thành.
- Threshold phần trăm do application truyền vào quota tracker; tracker không tự
  tạo quota limit. Production limit phải đến từ contract/provider response.
- Cache/circuit values đăng ký trong API chỉ mang tên `LOCAL_FAKE_OPTIONS`, không
  được dùng làm production defaults.

## Change map

| Area               | Files                                      | Change                                                         | Risk control                                    |
| ------------------ | ------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------- |
| Internal contract  | `packages/vietmap-client/src`              | Complete metadata, coordinate type, sanitized stable errors    | No vendor SDK/domain dependency                 |
| Fake adapter       | `fake-map.adapter.ts`                      | Deterministic search/reverse/route/matrix                      | No network and no random test output            |
| Resilience         | `resilient-map.adapter.ts`                 | Input allowlist, hashed keys, TTL/max-stale, retry and circuit | Bounded retry; explicit cached/degraded quality |
| Quota/telemetry    | `provider-telemetry.ts`                    | Safe observations and configurable percentage alarms           | Limit is supplied, never inferred               |
| API composition    | `apps/api/src/modules/map-provider`        | Fake registration or fail-closed blocked adapter               | Core boot/health independent from provider      |
| Tests/docs/runbook | specs, `docs/integrations`, RB-08, handoff | Failure/degrade/security tests and continuation instructions   | D-03 boundary is visible in code and docs       |

## Implementation sequence

1. Expand the provider-neutral port and response metadata.
2. Make the fake deterministic and add sanitized stable provider errors.
3. Add allowlisted requests, opaque cache keys, bounded retry, per-API circuit,
   bounded stale fallback and telemetry/quota primitives.
4. Register fake/blocked provider in API without coupling core health.
5. Test provider failures and update integration/runbook/handoff documentation.
6. After D-03 approval only: implement real HTTP mapping and sanitized recorded
   contract fixtures, then run sandbox contract tests.

## Test plan

- Unit: deterministic fake, coordinate/input validation, PII field stripping,
  cache hit, max-stale cutoff and complete metadata.
- Failure: timeout, 429 (`RATE_LIMITED`), 5xx (`UPSTREAM_UNAVAILABLE`), malformed
  response, bounded retry, circuit open and half-open recovery.
- Quota: configured 70/85/95 levels emit once per provider-defined period using
  an externally supplied limit; no quota value/window is invented.
- API: fake flag returns fake provider; fake disabled returns
  `CONFIGURATION_BLOCKED` without preventing application bootstrap.
- Deferred contract: sanitized real VietMap fixtures and endpoint/auth mapping
  remain blocked by D-03.

## Rollout and rollback

- Local/test keeps `VIETMAP_USE_FAKE_ADAPTER=true`.
- With fake disabled, current code deliberately returns a sanitized
  configuration-blocked error for provider calls. This must remain until real
  contract code and sandbox gates pass.
- Provider-backed features must treat thrown provider errors as unavailable and
  must not make SOS acceptance depend on them.
- Rollback application/package changes together. There is no migration or
  persisted provider cache to reverse.

## Definition of done

- [x] Domain/application surface imports only the provider-neutral port.
- [x] Fake search/reverse/route/matrix is deterministic and network-free.
- [x] Successful results expose provider/API/observed/cache/quality/latency.
- [x] Extra runtime fields are stripped before delegate calls; cache keys do not
      contain raw search text or exact coordinates.
- [x] Cache/max-stale, total timeout budget, jittered bounded retry and per-API
      circuit are tested.
- [x] Quota tracker accepts provider contract values and emits configured levels.
- [x] API registers fake or fail-closed adapter; provider outage is not core
      health.
- [x] Key leakage tests/documentation and outage/quota/rotation runbook updated.
- [ ] Real HTTP adapter and sanitized VietMap contract fixtures — BLOCKED D-03.
- [ ] Sandbox search/reverse/route/matrix contract suite — BLOCKED D-03.

## Progress log

- [x] Repository, requirements, ADR-001/009 and D-03 reviewed.
- [x] Provider-neutral implementation and unit tests completed.
- [x] API composition root wired with fake/fail-closed selection.
- [x] Integration guide, runbook, README and project handoff updated.
- [x] Local repository gates pass: frozen install, format, lint, typecheck, 124
      unit tests, coverage, contract drift, 30 integration tests, e2e prerequisite
      and build.
- [x] API boot smoke passes with `MapProviderModule`; `/health/live` returns 200
      with a request ID while eight local infrastructure services remain running.
- [ ] GitHub CI evidence recorded after push.

## Handoff

Do not add a real endpoint based only on public examples. First update D-03 with
approved version, auth/key types, API scopes, quota, licensing/cache terms and
sandbox access. Then add the HTTP adapter behind the existing port, retain the
resilience wrapper, add sanitized fixtures and prove no secret/PII leakage.

While D-03 is pending, proceed to T06 (map data lifecycle) or T07 (SOS vertical
slice). Both can use T04 without relying on a live map provider.
