# AGENTS.md

## Mission

Build the Lam Dong road-safety map platform. Preserve emergency intake,
privacy, evidence integrity, authorization, auditability and degraded-mode
behavior above feature convenience.

## Repository map

- apps/api NestJS modular monolith HTTP/realtime API
- apps/worker outbox/media/notification/SLA/expiry jobs
- apps/citizen-mobile React Native citizen app
- apps/citizen-web public Next.js web/PWA
- apps/ops-web operations, data admin and leader dashboards
- packages/contracts OpenAPI DTOs, generated clients, event schemas
- packages/domain framework-free value objects and shared invariants
- packages/authorization policy engine and access scope helpers
- packages/vietmap-client MapProviderPort + HTTP adapter; no keys here
- packages/observability OTel/logging/metric helpers
- packages/config typed configuration and validation
- packages/test-kit fixtures, factories, fake clock/provider
- packages/ui design tokens/components shared across web apps
- infra local compose and 09-VPS deployment automation
- docs ADRs, plans, security, data, UAT and runbooks

## Required workflow

1. Read this file, relevant ADRs, and the task execution plan (docs/plans/Txx.md).
2. Inspect before editing. State blockers; NEVER invent policy values.
3. Keep one coherent outcome per branch/chat; avoid unrelated refactors.
4. Implement vertically: migration -> domain -> application -> API -> client -> tests -> docs/observability.
5. Run all relevant gates and review the final diff before handoff.

## Commands

pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:contract
pnpm test:e2e
pnpm build

## Architecture rules

- Default to a modular monolith. Do not add a deployable service without an approved ADR.
- Domain code (packages/domain) must NOT import framework, ORM, HTTP SDK or environment config.
- Cross-module access uses public application services or versioned domain events only.
- Database changes are forward-only and rolling-deploy compatible (expand/contract).
- External providers (VietMap, object-storage, notification, AV) are ports/adapters; never call them inside DB transactions.
- Accepted SOS intake MUST work when VietMap and notification providers fail.
- Use transactional outbox (PostgreSQL -> RabbitMQ relay). Consumers and retried POSTs must be idempotent.
- No silent degradation: always set `quality` flag and `observed_at` when returning cached/fallback data.

## Security and privacy rules

- DENY BY DEFAULT. Enforce role + unit + area + case + data-class scope in every API handler.
- UI hiding is NEVER authorization.
- Never log tokens, keys, signed URLs, identity data, evidence object keys or case notes.
- Business tables (report.reports, incident.incidents) must NOT contain citizen technical identity.
- Unmasking requires approved break-glass policy, step-up MFA and immutable audit trail.
- Files always enter quarantine; readable only after type/size/hash/AV check passes.
- Never make original evidence public or overwrite its checksum/history.
- Never use an unverified citizen report or OCR result as an enforcement decision.

## Geospatial and API rules

- API coordinate order is EPSG:4326 GeoJSON [longitude, latitude].
- Public queries return only PUBLISHED and currently valid features (valid_from <= now < valid_to).
- Errors use stable Problem Details (RFC 7807) codes with trace_id; never internal stack traces.
- Public tracking codes (public_code) are random, high-entropy and non-enumerable.
- All timestamps in backend/database are UTC. UI displays in Asia/Ho_Chi_Minh.

## Testing and done

- Add tests for: state transitions, authorization denials, retry/idempotency, provider outages.
- Use fake clock and fake provider adapters; tests must be deterministic.
- No Critical/High security finding may be hidden or weakened to pass CI.
- Update OpenAPI schema, event schema, migration, ADR/runbook and observability with each code change.
- Handoff: changed files, commands run with results, assumptions, remaining risks, rollback steps.

## HARD STOPS -- do NOT invent these; wait for human decision

- SLA values, escalation timeouts, inter-agency coordination rules
- Data retention periods per classification
- Right/procedure to unmask anonymous reporters
- Security classification level (cap do ATTT)
- VietMap API quota, pricing, key types per contract
- Unit capability catalog and service-area GeoJSON
- Notification provider selection and channels
- Load profile and media size limits
