#!/usr/bin/env bash
# dev-up.sh - Start all local development services
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../infra/compose/docker-compose.yml"

echo "==> Starting ATGT local services..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans --wait --wait-timeout 120
docker compose -f "$COMPOSE_FILE" run --rm minio-init

echo ""
echo "==> Services running:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "==> Local dev URLs:"
echo "   API:         http://localhost:3000/api/v1/health/live"
echo "   RabbitMQ UI: http://localhost:15672  (atgt / devpassword_local)"
echo "   MinIO:       http://localhost:9001   (minio_dev / devpassword_local)"
echo "   Grafana:     http://localhost:3100"
echo "   MailHog:     http://localhost:8025"
echo "   Prometheus:  http://localhost:9090"
echo ""
echo "==> Ready! Run 'pnpm dev' to start the application."
