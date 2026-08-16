# T00 - Khoi tao repository va chuan chat luong

## Outcome

Monorepo co the build/test tu may sach, khong chua nghiep vu gia dinh.
AGENTS.md va PLANS.md duoc Codex nhan biet. Khong co secret/sample key that.

## Source requirements

- ADR-001 (modular monolith), ADR-008 (orchestration), ADR-009 (coordinates)
- Section 4.1 (repo structure), Section 4.2 (dependency rules), Section 4.3 (branch/commit)

## Current state (after T00)

All created:

- apps/api (NestJS stub, health controller + tests)
- apps/worker (stub)
- apps/citizen-mobile (stub)
- apps/citizen-web (stub)
- apps/ops-web (stub)
- packages/contracts (ProblemDetails, DTOs, EventEnvelope)
- packages/domain (GeoPoint, PublicCode, state enums)
- packages/authorization (roles, AccessScope)
- packages/vietmap-client (MapProviderPort, FakeMapAdapter)
- packages/config (typed config + validation)
- packages/test-kit (FakeClock, LamDong fixtures)
- packages/observability (StructuredLogger, redaction)
- packages/ui (stub)
- infra/compose/docker-compose.yml + DB init SQL
- infra/ansible/inventory.ini.example + README
- infra/monitoring/README
- docs/adr/ADR-001..010
- docs/plans/T00..T20
- docs/plans/DECISION-REGISTER.md
- docs/security/threat-model.md, access-control.md
- docs/data/data-dictionary.md, kpi-dictionary.md
- docs/uat/uat-scenarios.md (UAT-01..30)
- docs/runbooks/RB-01..15 + local-dev.md
- .github/workflows/ci.yml
- CODEOWNERS
- AGENTS.md, PLANS.md, README.md
- pnpm-workspace.yaml, turbo.json, package.json, tsconfig.base.json
- .env.example, .editorconfig, .gitignore

## Decisions and blockers

- D-01 (stack): Using reference stack (NestJS/RN/Next.js/Postgres/RMQ/Redis) - AWAITING CONFIRMATION
- D-02 (IdP): Not yet integrated - mock OIDC in T03
- D-03 (VietMap): FakeMapAdapter in place; real adapter in T05

## Definition of done

- [x] Repo structure created per Section 4.1
- [x] AGENTS.md created and PLANS.md template created
- [x] No real secrets in any file
- [x] Health-only API stub (apps/api)
- [x] packages/domain (GeoPoint, PublicCode) with unit tests
- [x] CI pipeline (.github/workflows/ci.yml)
- [x] All ADR skeletons (ADR-001..010)
- [x] Task plans T00-T20 created
- [x] Repository content normalized to the Git repository root
- [x] `pnpm-lock.yaml` committed and `pnpm install --frozen-lockfile` passes
- [x] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass

## Progress log

- [x] Directory structure
- [x] Root config files (package.json, tsconfig, turbo, pnpm-workspace, .env.example)
- [x] All package stubs
- [x] packages/domain value objects + specs
- [x] packages/contracts DTOs + events
- [x] packages/vietmap-client port + fake adapter
- [x] packages/config typed validation
- [x] packages/test-kit FakeClock + fixtures
- [x] packages/observability logger + redaction
- [x] apps/api health controller + tests
- [x] apps/worker/citizen-mobile/citizen-web/ops-web stubs
- [x] docs (ADR, plans, security, data, UAT, runbooks)
- [x] infra (compose, ansible, monitoring)
- [x] CI pipeline + CODEOWNERS

## Handoff

Changed files: project files are located directly at the repository root.
Tests written: GeoPoint.spec.ts, PublicCode.spec.ts, health.controller.spec.ts
Remaining risks:

- D-01: Stack confirmation needed before T00 gate passes
- The reference stack is validated for local development only; D-01 still blocks a production declaration.
  Next steps: proceed with T03 after the IdP decision or use the documented mock OIDC fallback.
  Rollback: N/A (new repository, no production deployment).
