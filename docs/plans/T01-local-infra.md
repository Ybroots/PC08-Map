# T01 - Local development infrastructure

## Outcome

Môi trường local lặp lại cho API/worker/Postgres-PostGIS/RabbitMQ/Redis/S3/observability.
Một lệnh khởi động tất cả; API/worker kết nối qua config.

## Source requirements

- Section 11.1 (VPS service map → local equivalent)
- ADR-006 (queue/outbox)
- ADR-007 (HA database → streaming replica in prod; single node in local dev)
- Appendix C (environment variables)

## Files created / modified

| File                                          | Change                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| infra/compose/docker-compose.yml              | Full compose: PG+PostGIS, RabbitMQ, Redis, MinIO, MailHog, OTel, Prometheus, Grafana |
| infra/compose/postgres/01-roles.sql           | DB roles: atgt_app, atgt_privacy, atgt_audit, atgt_migration                         |
| infra/compose/postgres/02-schemas.sql         | All schemas + permissions + PostGIS                                                  |
| infra/compose/postgres/03-platform-tables.sql | Outbox, idempotency store, audit table                                               |
| infra/compose/rabbitmq/rabbitmq.conf          | RabbitMQ config with definitions preload                                             |
| infra/compose/rabbitmq/definitions.json       | Exchange, queues, bindings, DLQ for all event types                                  |
| infra/compose/seed/01-dev-seed.sql            | Fake Lam Dong data (incident types, 3 units, 5 layers, 1 feature)                    |
| infra/compose/otel/otel-collector.yaml        | OTel Collector with sensitive field redaction                                        |
| infra/compose/otel/prometheus.yml             | Prometheus scrape config                                                             |
| infra/compose/otel/grafana-datasources.yaml   | Grafana Prometheus datasource                                                        |
| scripts/dev-up.sh                             | Start all services + health wait                                                     |
| scripts/dev-down.sh                           | Stop services (keep volumes)                                                         |
| scripts/dev-reset.sh                          | Full reset: volumes removed + re-seed                                                |
| scripts/dev-status.ps1                        | Windows health check script                                                          |
| .env.local                                    | Local dev environment (gitignored)                                                   |
| apps/api/test/local-infra.integration.ts      | Smoke tests: PG/PostGIS/RMQ/Redis/MinIO/env                                          |
| apps/api/jest.integration.config.js           | Integration test Jest config                                                         |
| docs/runbooks/local-dev.md                    | Full local dev setup guide                                                           |
| package.json                                  | Added dev:up/down/reset/status scripts                                               |

## Definition of done

- [x] docker compose up -d succeeds (all containers healthy)
- [x] PostgreSQL: schemas + roles + PostGIS + outbox + audit created
- [x] RabbitMQ: exchange, queues, DLQ pre-configured
- [x] MinIO: 3 buckets created (quarantine/original/derivative), all private
- [x] Seed: fake Lam Dong data only, no real PII
- [x] Smoke tests cover: PG connect, PostGIS, schemas, spatial query, TCP checks, env validation
- [x] Reset uses the current Compose project and removes only its named `atgt-*` volumes
- [x] .env.local gitignored; no secrets in committed files

## Security checks

- [x] All passwords are "devpassword_local" (clearly fake, not used in prod)
- [x] audit table: atgt_app has INSERT+SELECT only (REVOKE DELETE/UPDATE applied)
- [x] privacy schema: separate role atgt_privacy only
- [x] VIETMAP_USE_FAKE_ADAPTER=true in local dev
- [x] PRIVACY_POLICY_VERSION=PENDING (vault feature disabled)
- [x] RETENTION auto-delete disabled
- [x] OTel collector redacts db.connection_string and auth headers

## Progress log

- [x] docker-compose.yml (full with all services)
- [x] PostgreSQL init SQL (roles + schemas + platform tables)
- [x] RabbitMQ config (exchanges/queues/DLQ)
- [x] MinIO bucket init
- [x] OTel/Prometheus/Grafana configs
- [x] Seed data (fake Lam Dong)
- [x] Dev scripts (up/down/reset/status)
- [x] .env.local
- [x] Integration smoke tests
- [x] local-dev.md runbook

## Handoff

Tests to run:

```bash
# Start services
pnpm dev:up   # or: docker compose -f infra/compose/docker-compose.yml up -d

# Run unit tests (no services needed)
pnpm test

# Run integration smoke tests (services required)
pnpm test:integration
# or: SKIP_SMOKE=true pnpm test:integration   (skip in CI)
```

Validated on a clean local volume set: eight long-running services became healthy,
the one-shot MinIO initializer created three private buckets, and both integration
suites passed. CI now performs the same Compose cold start and always removes its
volumes afterward.

Remaining risks:

- D-01: Stack confirmation remains pending (Node/pnpm reference versions are 20/9).
- Integration tests require Docker services; the CI job provisions them explicitly.

Next task: T02 - Contract and error platform (completed; see `T02-contract-platform.md`).
