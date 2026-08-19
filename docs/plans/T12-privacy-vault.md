# T12 - Privacy vault va break-glass

## Outcome

Tach citizen technical identity khoi business schemas va chi mo workflow unmask
khi co quy che duoc phe duyet. Hien tai task dung o safe boundary: business data
PII-free, privacy DB role/schema tach rieng va break-glass deny-by-default.

## Source requirements

- REQ-09: audit moi lan xem/export/go an danh, dual approval.
- ADR-004: identity link neu duoc phep chi nam trong privacy vault, khong default
  join tu incident/report.
- UAT-23/24: thieu approver, grant het han/reuse phai bi deny.

## Current state

- `privacy` schema chi grant cho `atgt_privacy`; app/audit role khong co access.
- Business incident/report/evidence schemas va event contracts khong chua citizen
  session, IP, device/account identity.
- Authorization co step-up interface nhung `privacy.break_glass.approve` luon deny.
- RB-12 ton tai nhung chua the dien rule/owner/SLA khi quy che chua co.

## Decisions and blockers

- D-06 PENDING: khong tao retention/archive/delete job.
- D-07 PENDING: khong thu identity link, khong nhan request/approval, khong cap
  grant va khong mo ops UI. MFA claim mot minh khong du.
- D-02 PENDING: production officer identity/step-up chua duoc phe duyet.

## Definition of done

- [x] Business schemas co negative identity-column tests.
- [x] Privacy schema/role tach biet va break-glass deny-by-default.
- [ ] Approved D-07 request/approval/grant/use/revoke policy.
- [ ] Approved D-06 retention/legal-hold policy.
- [ ] T12 implementation/UAT-23..25.

## Progress log

- [x] 2026-08-19: reviewed after T11B2B1; task is BLOCKED by D-06/D-07.

## Handoff

- Changed files: plan only; no vault runtime or identity collection was added.
- Remaining risks: a dormant schema is not a privacy workflow.
- Rollback: none; keep break-glass disabled.
