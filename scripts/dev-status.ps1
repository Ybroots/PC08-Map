# dev-status.ps1 - Show health of all local services
param()

$composeFile = Join-Path $PSScriptRoot "..\infra\compose\docker-compose.yml"

Write-Host "==> ATGT Local Services Status" -ForegroundColor Cyan
docker compose -f $composeFile ps

Write-Host ""
Write-Host "==> Health checks:" -ForegroundColor Cyan

$checks = @(
  @{ Name = "PostgreSQL";   Url = "localhost:5432";    Cmd = 'docker exec atgt-postgres pg_isready -U postgres -d atgt_dev -q' },
  @{ Name = "RabbitMQ";     Url = "localhost:15672";   Cmd = 'docker exec atgt-rabbitmq rabbitmq-diagnostics ping -q' },
  @{ Name = "Redis";        Url = "localhost:6379";    Cmd = 'docker exec atgt-redis redis-cli -a devpassword_local ping' },
  @{ Name = "MinIO";        Url = "localhost:9000";    Cmd = '' },
  @{ Name = "API (if up)";  Url = "localhost:3000";   Cmd = '' }
)

foreach ($c in $checks) {
  try {
    if ($c.Cmd) {
      $result = Invoke-Expression $c.Cmd 2>&1
      $ok = $LASTEXITCODE -eq 0
    } else {
      $tcp = Test-NetConnection -ComputerName localhost -Port ($c.Url -split ':')[1] -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
      $ok = $tcp.TcpTestSucceeded
    }
    $status = if ($ok) { "OK" } else { "DOWN" }
    $color  = if ($ok) { "Green" } else { "Red" }
    Write-Host "   $($c.Name.PadRight(20)) $status" -ForegroundColor $color
  } catch {
    Write-Host "   $($c.Name.PadRight(20)) ERROR" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "==> URLs:" -ForegroundColor Cyan
Write-Host "   API:         http://localhost:3000/api/v1/health/live"
Write-Host "   RabbitMQ UI: http://localhost:15672  (atgt / devpassword_local)"
Write-Host "   MinIO:       http://localhost:9001   (minio_dev / devpassword_local)"
Write-Host "   Grafana:     http://localhost:3100"
Write-Host "   MailHog:     http://localhost:8025"
