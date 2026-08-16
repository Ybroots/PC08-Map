# UAT Scenarios - ATGT Lam Dong Platform

**Status**: DRAFT — Complete before T20 pilot release

## SOS (UAT-01 to UAT-07)

| ID     | Scenario                   | Expected result                                                |
| ------ | -------------------------- | -------------------------------------------------------------- |
| UAT-01 | SOS online, GPS good       | Received within 3 tap; ops queue shows; public code returned   |
| UAT-02 | SOS with low GPS accuracy  | Accuracy shown; low-accuracy warning displayed; still accepted |
| UAT-03 | Submit offline, reconnect  | Queued locally; sent on reconnect; ops receives; no duplicate  |
| UAT-04 | Double-tap SOS (retry)     | Idempotent; only one incident created                          |
| UAT-05 | VietMap timeout during SOS | SOS still accepted (201/202); ops receives; degraded ETA shown |
| UAT-06 | ETA with live VietMap      | ETA shown as LIVE; dispatch candidate list accurate            |
| UAT-07 | ETA with VietMap fallback  | ETA shown as DEGRADED/CACHED; operator clearly informed        |

## Dispatch (UAT-08 to UAT-10)

| ID     | Scenario                    | Expected result                                          |
| ------ | --------------------------- | -------------------------------------------------------- |
| UAT-08 | Assignment in correct scope | Only units in service area shown; assigned unit notified |
| UAT-09 | SLA timeout exceeded        | Escalation triggered; alert sent; audit trail complete   |
| UAT-10 | Reassignment with reason    | Reason required; audit shows both old and new assignment |

## Evidence (UAT-11 to UAT-14)

| ID     | Scenario                      | Expected result                                                |
| ------ | ----------------------------- | -------------------------------------------------------------- |
| UAT-11 | Upload valid image            | Processed; preview visible to authorized user; checksum stored |
| UAT-12 | Upload malware file           | Quarantined; not readable; alert triggered; report marked      |
| UAT-13 | EXIF data in photo            | Derivative has EXIF stripped; original retained immutably      |
| UAT-14 | Unauthorized download attempt | Blocked; audit event logged                                    |

## Reports (UAT-15 to UAT-17)

| ID     | Scenario                    | Expected result                                                |
| ------ | --------------------------- | -------------------------------------------------------------- |
| UAT-15 | Duplicate report submission | Flagged as duplicate candidate; operator confirms or overrides |
| UAT-16 | Invalid/incomplete report   | Rejected with reason; public code still not exposed            |
| UAT-17 | Tracking code lookup        | Only general status returned; no investigation details         |

## Map data (UAT-18 to UAT-21)

| ID     | Scenario                  | Expected result                                                  |
| ------ | ------------------------- | ---------------------------------------------------------------- |
| UAT-18 | Draft layer not public    | Public API returns 404/empty for draft layers                    |
| UAT-19 | Maker-checker enforcement | Editor cannot approve own version; approver required             |
| UAT-20 | Feature auto-expiry       | Feature disappears from public API after valid_to passes         |
| UAT-21 | Version rollback          | Previous approved version can be republished; audit trail intact |

## Access control (UAT-22 to UAT-25)

| ID     | Scenario                           | Expected result                                        |
| ------ | ---------------------------------- | ------------------------------------------------------ |
| UAT-22 | Cross-area access denied           | Officer cannot view cases from different area          |
| UAT-23 | Break-glass insufficient approvers | Single approver rejected; requires second approver     |
| UAT-24 | Break-glass grant expired          | Access denied after TTL; audit shows expiry            |
| UAT-25 | Audit export                       | Requires reason; export logged; hash/watermark present |

## Infrastructure (UAT-26 to UAT-30)

| ID     | Scenario                | Expected result                                              |
| ------ | ----------------------- | ------------------------------------------------------------ |
| UAT-26 | Edge/App node failure   | Traffic fails over; no SOS lost; banner shown if degraded    |
| UAT-27 | DB promotion (failover) | Runbook executed; app reconnects; data consistent            |
| UAT-28 | Backup restore test     | PITR restore to point-in-time; data verified                 |
| UAT-29 | VietMap quota alert     | Alert fires at 70/85/95%; dashboard shows per-API usage      |
| UAT-30 | VietMap key rotation    | New key active; old key deactivated; no service interruption |
