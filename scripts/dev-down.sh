#!/usr/bin/env bash
# dev-down.sh - Stop all local development services (keeps volumes)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../infra/compose/docker-compose.yml"

echo "==> Stopping ATGT local services (volumes preserved)..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans
echo "==> Done. Volumes preserved. Use dev-reset.sh to also clear volumes."
