# Local Development Setup Runbook

## Prerequisites

| Tool           | Version   | Install             |
| -------------- | --------- | ------------------- |
| Node.js        | >= 20 LTS | https://nodejs.org  |
| pnpm           | >= 9      | `npm i -g pnpm@9`   |
| Docker Desktop | >= 4.20   | https://docker.com  |
| Git            | any       | https://git-scm.com |

## First-time setup

```bash
# 1. Clone repository
git clone <repo-url> atgt-platform
cd atgt-platform

# 2. Copy env file
cp .env.example .env.local
# Edit .env.local if needed (defaults work out of the box)

# 3. Start all services
pnpm dev:up
# (on Windows: docker compose -f infra/compose/docker-compose.yml up -d)

# 4. Install dependencies
pnpm install --frozen-lockfile

# 5. Verify everything works
pnpm typecheck
pnpm test
pnpm test:integration   # requires services running

# 6. Start API in dev mode
pnpm dev
```

## Daily workflow

```bash
# Start services (if not running)
pnpm dev:up

# Check status
pnpm dev:status          # Windows PowerShell
# or: docker compose -f infra/compose/docker-compose.yml ps

# Start app
pnpm dev

# Stop services (keep data)
pnpm dev:down

# Full reset (delete all local dev data + re-seed)
pnpm dev:reset
```

## Service URLs

| Service             | URL                                      | Credentials                             |
| ------------------- | ---------------------------------------- | --------------------------------------- |
| API health          | http://localhost:3000/api/v1/health/live | -                                       |
| RabbitMQ management | http://localhost:15672                   | atgt / devpassword_local                |
| MinIO console       | http://localhost:9001                    | minio_dev / devpassword_local           |
| Grafana             | http://localhost:3100                    | anonymous (admin role)                  |
| Prometheus          | http://localhost:9090                    | -                                       |
| MailHog (email)     | http://localhost:8025                    | -                                       |
| PostgreSQL          | localhost:5432                           | atgt_app / devpassword_local / atgt_dev |

## Troubleshooting

### Port conflict

```bash
# Check what is using a port
netstat -ano | findstr :5432   # Windows
lsof -i :5432                  # Mac/Linux

# Stop conflicting service, then:
pnpm dev:up
```

### Database schema out of sync

```bash
# Reset and reseed
pnpm dev:reset
```

### Container won't start healthy

```bash
docker compose -f infra/compose/docker-compose.yml logs <service-name>
# Example:
docker compose -f infra/compose/docker-compose.yml logs postgres
```

### PostGIS not working

```bash
# Connect and check
docker exec -it atgt-postgres psql -U postgres -d atgt_dev -c "SELECT PostGIS_Version();"
```

## Security notes for local dev

- Passwords in .env.local are LOCAL DEV ONLY - never use in any other environment
- .env.local is in .gitignore - never commit it
- Real VietMap keys are NOT used in local dev (VIETMAP_USE_FAKE_ADAPTER=true)
- Privacy vault feature is DISABLED (PRIVACY_POLICY_VERSION=PENDING) until D-07 approved
- Auto-delete retention jobs are DISABLED until D-06 approved

## Seed data

All seed data is FAKE synthetic data for Lam Dong area. See `infra/compose/seed/01-dev-seed.sql`.

- 3 fake dispatch units (Da Lat x2, Bao Loc x1)
- 5 map layers (dangerous_points, road_closures, parking_zones, no_parking, temp_events)
- 1 fake dangerous point at Da Lat city center
- Fake incident type catalog

NEVER import real incident data, real personal data, or real unit operational data into local dev.
