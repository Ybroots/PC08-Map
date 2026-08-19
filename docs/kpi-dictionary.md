# KPI and metric dictionary

T16A defines measurement provenance only. It does not define an approved KPI
baseline, target, SLA, alert threshold or production small-cell threshold.

## Executable metrics

| Key                | Metric name                   | Unit  | Trusted source event          | Dimensions                         | Owner role                 | Target state   |
| ------------------ | ----------------------------- | ----- | ----------------------------- | ---------------------------------- | -------------------------- | -------------- |
| INCIDENTS_RECEIVED | atgt_incidents_received_total | event | incident.received.v1          | local_day, incident_type, priority | ATGT_OPERATIONS_GOVERNANCE | GOVERNED_UNSET |
| REPORTS_RECEIVED   | atgt_reports_received_total   | event | report.received.v1            | local_day, category_code           | ATGT_REPORT_GOVERNANCE     | GOVERNED_UNSET |
| REPORTS_SCREENED   | atgt_reports_screened_total   | event | report.screening_completed.v1 | local_day, mode                    | ATGT_REPORT_GOVERNANCE     | GOVERNED_UNSET |

`event` means a unique valid state event ID, not a RabbitMQ delivery attempt.
At-least-once redelivery is deduplicated. Reusing an event ID with different
content fails reconciliation instead of changing the count silently.

## Time, scope and freshness

- Source timestamps remain UTC. `local_day` uses `Asia/Ho_Chi_Minh`; the local
  day changes at 17:00:00Z.
- Queries require a resolved `leader_viewer` access scope and one area present in
  that scope. Analytics never joins the privacy vault or citizen identity.
- `dataFreshThrough` is the newest included source-event timestamp. It is not the
  dashboard render time and must remain visible when a UI is added.

## Small-cell suppression

The application caller must inject an approved integer threshold greater than or
equal to two. There is no default. A cell below the threshold returns
`value: null` and `suppressed: true`; it never returns the raw count in another
field. Production wiring stays disabled until the governance owner approves the
threshold and D-09 query/load bounds.

## Governed values still missing

- Baseline and target per metric/area/period.
- SLA-derived metrics, because D-04/D-05 are pending.
- Production small-cell threshold and aggregation/query limits.
- Audit export scope, reason taxonomy, signing/hash custody and retention.

These values must be stored as versioned governed configuration in a later slice;
they must not be hard-coded in UI, SQL or application defaults.
