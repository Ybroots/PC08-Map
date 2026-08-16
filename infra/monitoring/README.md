# Monitoring Stack

## Components

| Component               | Purpose                         |
| ----------------------- | ------------------------------- |
| Prometheus              | Metrics collection and alerting |
| Grafana                 | Dashboards                      |
| Loki / Elastic          | Log aggregation                 |
| Alertmanager            | Alert routing and suppression   |
| OpenTelemetry Collector | Trace/metric/log ingestion      |

## Key alerts (draft - confirm thresholds with ops team)

| Alert                                | Threshold     | Severity |
| ------------------------------------ | ------------- | -------- |
| SOS ingest p95 latency               | > 2s          | P1       |
| Ops display p95 latency              | > 3s          | P1       |
| RabbitMQ DLQ depth                   | > 0           | P1       |
| RabbitMQ queue age (critical events) | > 60s         | P1       |
| DB replication lag                   | > 30s         | P2       |
| VietMap quota 70%                    | threshold     | P3       |
| VietMap quota 85%                    | threshold     | P2       |
| VietMap quota 95%                    | threshold     | P1       |
| Core availability                    | < 99.9%/month | P1       |
| Certificate expiry                   | < 30 days     | P2       |
| Audit reconciliation mismatch        | any           | P1       |

## Dashboards

- [ ] SOS/Incident overview
- [ ] Dispatch and SLA metrics
- [ ] Evidence pipeline health
- [ ] VietMap adapter (quota/latency/error per API)
- [ ] Queue depth and DLQ
- [ ] DB primary/replica lag
- [ ] Infrastructure health (per VPS)
- [ ] Security audit summary
