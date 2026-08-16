# VietMap integration boundary

## Current production status

Real VietMap integration is disabled because Decision D-03 is `PENDING`. This
repository does not contain a server key, vendor endpoint mapping or a production
HTTP adapter. Setting `VIETMAP_USE_FAKE_ADAPTER=false` keeps the API core alive
and makes every map-provider call fail with `CONFIGURATION_BLOCKED`.

## Internal contract

Consumers inject `MAP_PROVIDER_PORT` and can call `search`, `reverse`, `route`
or `matrix`. Coordinates are EPSG:4326 `[longitude, latitude]`. Provider context
contains only:

- `traceId`
- per-call `timeoutMs`
- optional `locale` (`vi` or `en`)

Do not add incident/report/case IDs, public tracking codes, identity, evidence,
case notes or unit position metadata to that context or the provider inputs.
Runtime requests are copied through an allowlist before delegation, so unknown
fields are removed.

Every successful result carries:

- `provider` and `apiVersion`
- `observedAt` in UTC
- `cacheStatus`: `MISS`, `HIT`, `STALE` or `BYPASS`
- `quality`: `LIVE`, `CACHED`, `DEGRADED` or `UNAVAILABLE`
- `latencyMs`

Fresh cache hits are marked `CACHED`; bounded stale fallback is marked
`DEGRADED`. Data beyond `maxStaleMs` is never returned.

## Security and reliability invariants

- Provider calls never belong inside a database transaction.
- Search text and exact coordinates never appear directly in cache keys.
- Only stable error codes cross the adapter boundary; upstream bodies and URLs
  are not included in errors or logs.
- Retry shares one total caller deadline, adds jittered exponential delay, is
  finite and applies only to errors explicitly marked retryable.
- Circuit state is isolated by API operation and supports one recovery probe.
- Quota tracking requires an observed/approved limit, key alias and
  provider-defined period identity. It does not infer the contract limit or
  reset window.
- Provider availability must not participate in core health or accepted SOS
  transaction success.

## Local development

Keep `VIETMAP_USE_FAKE_ADAPTER=true`. The fake adapter makes no network call and
returns deterministic Lam Dong-shaped fixtures through the same resilience
boundary as future production traffic.

## Checklist to unblock the real adapter

D-03 must record human approval for all of the following:

1. API base URL and exact API version for each operation.
2. Request/response/error schemas and coordinate/vehicle semantics.
3. Server/client key types, allowed API scopes and secret-store resolution.
4. Sandbox credentials and permitted sanitized fixture recording.
5. Contract quota/rate headers, pricing and environment-specific limits.
6. License rules for caching, maximum stale age and stored response fields.
7. Approved timeout, retry, circuit and alert budgets per API/environment.

After approval, implement an HTTP adapter behind `MapProviderPort`, add runtime
response validation and sanitized fixture tests for success, timeout, 429, 5xx
and malformed responses. Scan source, logs, snapshots and public bundles for the
real key before enabling it.
