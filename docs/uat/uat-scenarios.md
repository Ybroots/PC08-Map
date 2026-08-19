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

T09 has deterministic application/UI coverage for UAT-01..04 boundaries and
Android emulator evidence for the complete native paths below. Physical-device
network/call behavior and iOS build/UAT still remain release gates.

### T09 Android emulator evidence — 2026-08-17

Target: Pixel 6 AVD, Android 14/API 34, Google APIs x86_64; synthetic local API
and PostgreSQL/PostGIS stack. The emulator used `10.0.2.2` only through the
explicit debug Android configuration.

| ID     | Result | Evidence                                                                                                              |
| ------ | ------ | --------------------------------------------------------------------------------------------------------------------- |
| UAT-01 | PASS   | Precise OS permission, two-step submit, server/public tracking `RMDCKVSBYQ2R` = `RECEIVED`; one incident persisted.   |
| UAT-02 | PASS   | Approximate fix rendered `±2000 m` warning; submit still ACKed as `SRQ4E5MQ0S5M`; one row with `accuracy_m=2000`.     |
| UAT-03 | PASS   | Airplane mode saved locally with no false ACK; reconnect drained automatically; `754WBBMP83MK` = `RECEIVED`, one row. |
| UAT-04 | PASS   | Two immediate confirmation taps produced one new incident only; `Z1YTSGH9NTWK` = `RECEIVED`, DB count delta was one.  |

Additional native checks: denying FINE and COARSE renders an explicit permission
message while keeping all four `112/113/114/115` actions. Tapping 112 dispatched
`android.intent.action.VIEW` with `tel:112` to Google Dialer. This proves Android
intent wiring, not a physical emergency call. Test location providers and shell
mock-location permission were removed after the run; no real incident or person
data was used. The authorized `lam-dong` ops feed returned all four UAT incidents
with monotonic cursors 12–15 and state `RECEIVED`.

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

T10B2/T10B3 technical integration now verifies clean JPEG processing,
duplicate-event idempotency, exact immutable original, EXIF-free watermarked
derivative, EICAR rejection, authorized derivative/original signed reads and a
uniform denied response plus audit for wrong case/data class. This is backend
acceptance evidence for UAT-11, UAT-13 and UAT-14, not end-user UAT. UAT-12 still
lacks the approved production AV and alert workflow, and UAT-11..14 remain pending
as complete pilot scenarios.

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

T14A local UI evidence (2026-08-19) is not an operator UAT pass. The synthetic
read-only incident workspace was exercised at 1440x1000 and 390x844: queue filter
and selection worked, mobile horizontal overflow was 0 px, reduced-motion removed
the freshness animation, and browser console/page errors were zero. Screenshots:
`docs/uat/evidence/t14a-ops-desktop.png` and
`docs/uat/evidence/t14a-ops-mobile.png`. Real role/session, concurrency, dispatch,
SLA and cross-area UAT remain blocked by D-02/D-04/D-05/D-09.

## Infrastructure (UAT-26 to UAT-30)

| ID     | Scenario                | Expected result                                              |
| ------ | ----------------------- | ------------------------------------------------------------ |
| UAT-26 | Edge/App node failure   | Traffic fails over; no SOS lost; banner shown if degraded    |
| UAT-27 | DB promotion (failover) | Runbook executed; app reconnects; data consistent            |
| UAT-28 | Backup restore test     | PITR restore to point-in-time; data verified                 |
| UAT-29 | VietMap quota alert     | Alert fires at 70/85/95%; dashboard shows per-API usage      |
| UAT-30 | VietMap key rotation    | New key active; old key deactivated; no service interruption |
