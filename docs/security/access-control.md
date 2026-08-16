# Access Control Policy

**Status**: DRAFT — Requires ATTT review before production

## Role matrix

| Role             | Scope                | Key permissions                                      | Restrictions                    |
| ---------------- | -------------------- | ---------------------------------------------------- | ------------------------------- |
| citizen_guest    | session/device       | Submit SOS/report, view public layers, track by code | No internal/PII access          |
| dispatcher       | area/shift           | Verify, assign, escalate, view evidence by case      | Cannot approve unmask alone     |
| field_officer    | unit/assigned case   | Receive task, update status/result                   | Cannot view cases outside scope |
| data_editor      | layer/area           | Create/edit drafts                                   | Cannot approve own drafts       |
| data_approver    | layer/area           | Approve/publish/withdraw                             | Four-eyes for sensitive layers  |
| leader_viewer    | province/unit        | Aggregated dashboard, drill-down by granted scope    | No identity access by default   |
| security_auditor | system (task-scoped) | Audit log, anomaly queries                           | Read-only; export logged        |
| privacy_approver | specific request     | Approve break-glass                                  | Requires 2 approvers + MFA      |
| system_admin     | infra/config         | User mapping, config, integrations                   | No evidence access by default   |

## ABAC dimensions

- role: enum above
- unit_id: officer's assigned unit
- area_id: geographic jurisdiction
- case_id: specific incident/report assigned
- data_class: public / internal / sensitive / restricted

## Deny-by-default enforcement

- Every controller method requires explicit `@RequirePolicy()` decorator
- Repository methods require `AccessScope` parameter
- Tests must include explicit denial cases for each role boundary
