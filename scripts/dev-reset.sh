#!/usr/bin/env bash
# dev-reset.sh - Full reset: stop, remove volumes, restart, re-seed
# SAFE: Only removes volumes declared by this Compose project.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../infra/compose/docker-compose.yml"

echo "==> WARNING: This will delete all local dev data and re-seed from scratch."
echo "    Press Ctrl+C within 5 seconds to cancel..."
sleep 5

echo "==> Stopping services..."
docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans

echo "==> Starting fresh..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans --wait --wait-timeout 120
docker compose -f "$COMPOSE_FILE" run --rm minio-init

echo "==> Verifying automatic seed data..."
seed_count="$(docker exec atgt-postgres psql -U postgres -d atgt_dev -tAc 'SELECT COUNT(*) FROM incident.incident_type_catalog')"
if [ "$seed_count" -lt 6 ]; then
  echo "ERROR: Expected at least 6 seeded incident types, found $seed_count"
  exit 1
fi

echo ""
echo "==> Reset complete! All data is fake Lam Dong dev data."
