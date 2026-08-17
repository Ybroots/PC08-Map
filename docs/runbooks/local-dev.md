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
# Edit .env.local. For local OIDC, enable the mock adapter and provide a
# non-production opaque token plus the officer scope described below.

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

## Local identity setup

The repository is fail-closed: `.env.example` does not include a usable officer
credential, and staging/production refuse to start with the mock adapter. For
local development only, set the following values in the ignored `.env.local`
file:

```dotenv
OIDC_USE_MOCK=true
OIDC_MOCK_TOKEN=<a-long-random-local-only-value>
OIDC_MOCK_SUBJECT=local-officer
OIDC_MOCK_ROLE=dispatcher
OIDC_MOCK_UNIT_IDS=unit-dalat-traffic
OIDC_MOCK_AREA_IDS=area-dalat
OIDC_MOCK_CASE_IDS=case-local-001
OIDC_MOCK_MAX_DATA_CLASS=internal
OIDC_MOCK_AUTHENTICATION_METHODS=pwd,mfa
OIDC_MOCK_SESSION_ID=local-session
```

Never paste the token into issue reports, screenshots, application logs, or
committed files. Officer routes require both a valid bearer credential and an
explicit route policy; a route without policy metadata is denied.

Anonymous citizen sessions can be exercised without storing their raw tokens:

```bash
curl -sS -X POST http://localhost:3000/api/v1/public/sessions \
  -H "Content-Type: application/json" \
  -d '{"device_class":"web"}'
```

The response is `Cache-Control: no-store`. The API persists only a SHA-256 token
hash in `identity.citizen_sessions`; callers must keep the returned token only
for the active client session. Rotation uses
`POST /api/v1/public/sessions/rotate` with the token in
`X-Citizen-Session` and invalidates the previous token atomically.

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

### Map lifecycle worker

The scheduler is fail-closed. Local API/map reads do not require it. To exercise
automatic publish/expiry, set both values explicitly before starting the worker:

```dotenv
MAP_LIFECYCLE_WORKER_ENABLED=true
MAP_LIFECYCLE_POLL_MS=5000
```

`MAP_LIFECYCLE_POLL_MS` has no default when the worker is enabled because D-09
has no approved production load profile. Leave the feature disabled in an
environment without an approved polling value. The job is idempotent and writes
the lifecycle event plus `map.cache.invalidate.v1` in the same transaction.

### SOS intake and outbox relay

Both paths are fail-closed. For synthetic local development only, add explicit
values to the ignored `.env.local`:

```dotenv
SOS_INGEST_ENABLED=true
SOS_INTAKE_AREA_ID=lam-dong
SOS_IDEMPOTENCY_TTL_MINUTES=60

OUTBOX_RELAY_ENABLED=false
# When intentionally exercising the relay, both are mandatory:
# OUTBOX_RELAY_POLL_MS=1000
# OUTBOX_RELAY_BATCH_SIZE=25
```

The local values are test fixtures, not approved production policy. D-05 owns
the real intake area; D-06 owns retention (there is no cleanup job); D-09 owns
relay/load tuning. SOS acceptance never calls VietMap, RabbitMQ or notification.
To verify the HTTP boundary with the map adapter configuration-blocked, set
`VIETMAP_USE_FAKE_ADAPTER=false`, start the built API, then run:

```bash
python scripts/t07_api_smoke.py
```

The smoke checks 202 acknowledgement, exact idempotent replay, generalized
tracking and aggregate metrics. Restore the intended local adapter setting
after the test. The forced integration suite covers concurrent submit, scoped
resume feed, tracking enumeration and relay failure/retry:

```bash
pnpm exec turbo run test:integration --force
```

### Citizen mobile SOS foundation

T09 exports a fail-closed native composition from `apps/citizen-mobile`. The API
base URL is mandatory and production URLs must use HTTPS; only localhost may use
HTTP. Do not hard-code a production endpoint or secret in the bundle:

```tsx
const runtime = createNativeSosRuntime({
  apiBaseUrl,
  incidentTypes: approvedIncidentTypes,
});
return <SosScreen {...runtime} />;
```

The queue uses the device-only keychain service
`vn.gov.lamdong.atgt.sos.queue.v1`. There is deliberately no AsyncStorage or
plaintext fallback. Do not clear this keychain entry during rollback, logout,
upgrade or troubleshooting: it may contain an SOS that the server has not yet
acknowledged or a tracking code the citizen still needs.

`incidentTypes` is mandatory and must come from the deployment's approved
incident catalog. `DEFAULT_SOS_INCIDENT_TYPES` is a reference/local fixture, not
a silent production fallback; an empty, duplicate or malformed catalog fails
closed before runtime composition.

T09's named client UX defaults are 30 seconds for stale-location warning,
100 metres for low-accuracy warning, and 15 seconds for the OS position request.
They only change guidance; they never reject an SOS. D-09 remains pending and no
media/load limit is implemented.

Run the platform-independent mobile gates from repository root:

```bash
pnpm --filter @atgt/citizen-mobile lint
pnpm --filter @atgt/citizen-mobile typecheck
pnpm --filter @atgt/citizen-mobile test
pnpm --filter @atgt/citizen-mobile build
```

This repository does not yet contain `android/` or `ios/`. Before device UAT,
create a React Native 0.73-compatible native shell, configure Android fine
location permission and iOS `NSLocationWhenInUseUsageDescription`, link keychain/
NetInfo/geolocation, inject the HTTPS API URL and verify `tel:` on real devices.
Never mark T09 native-ready from Jest/TypeScript results alone.

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

This recreates every local volume and initializes the platform, identity, and
seed schemas from scratch. It permanently removes local development data.

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

### Verify T04 core migration

Development seed contains inserts only; core tables must already exist when the
seed starts. After `pnpm dev:reset`, verify the generated geography and reliable
event tables:

```bash
docker exec -it atgt-postgres psql -U postgres -d atgt_dev -c \
  "SELECT table_schema, table_name FROM information_schema.tables WHERE (table_schema, table_name) IN (('incident','incidents'),('platform','outbox'),('platform','inbox_messages'));"

docker exec -it atgt-postgres psql -U postgres -d atgt_dev -c \
  "SELECT indexname FROM pg_indexes WHERE indexname IN ('incidents_geom_idx','map_features_geom_idx','dispatch_units_service_area_idx');"
```

Run `pnpm test:integration` for coordinate round-trip, atomic incident/outbox,
duplicate inbox claim and scoped repository checks. Do not edit a mounted init
SQL file and expect an existing PostgreSQL volume to re-run it; use
`pnpm dev:reset`, which permanently deletes local development data.

## Security notes for local dev

- Passwords in .env.local are LOCAL DEV ONLY - never use in any other environment
- .env.local is in .gitignore - never commit it
- Real VietMap keys are NOT used in local dev (VIETMAP_USE_FAKE_ADAPTER=true)
- Privacy vault feature is DISABLED (PRIVACY_POLICY_VERSION=PENDING) until D-07 approved
- Break-glass authorization is DISABLED until its policy and approval path are accepted
- Mock OIDC is allowed only in development/test; production-like environments require HTTPS issuer and JWKS URLs
- Raw officer/citizen credentials are never persisted or written to security audit events
- Auto-delete retention jobs are DISABLED until D-06 approved

## Seed data

All seed data is FAKE synthetic data for Lam Dong area. See `infra/compose/seed/01-dev-seed.sql`.

- 3 fake dispatch units (Da Lat x2, Bao Loc x1)
- 5 map layers (dangerous_points, road_closures, parking_zones, no_parking, temp_events)
- 1 fake dangerous point at Da Lat city center
- Fake incident type catalog
- No fake SOS business records are seeded; integration and HTTP smoke fixtures
  clean up their own records.

NEVER import real incident data, real personal data, or real unit operational data into local dev.
