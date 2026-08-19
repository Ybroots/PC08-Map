# Access Control Policy

**Status**: DRAFT — T03 executable baseline; requires ATTT and D-02 review before production

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
- Public endpoints require explicit `@PublicRoute()`; absence of both is denied
- Repository methods require `AccessScope` parameter
- Tests must include explicit denial cases for each role boundary

For evidence reads, `dispatcher` must have `evidence.view`, the route area and the
assigned case. The evidence repository independently matches persisted owner/area,
then reevaluates the actual data class. Preview signs only the derivative and
download signs only the immutable original. Missing and out-of-scope resources
share a uniform not-found response while each issuance/denial is audited.

For citizen report verification, `dispatcher` must have `report.read` or
`report.verify` and the exact route area within the resolved scope. The repository
rechecks persisted area and actual data class. Field officers and other roles
cannot decide reports. A DUPLICATE decision additionally requires a pending
candidate ID and optimistic candidate version; the suggestion itself has no
authority to change report state.

## OIDC claim contract

| Claim             | Required      | Use                                           |
| ----------------- | ------------- | --------------------------------------------- |
| `iss` + `sub`     | Yes           | Stable hashed principal reference             |
| `sid`             | Yes           | Session revocation by stored hash             |
| `atgt_role`       | Yes           | One known officer role; unknown values denied |
| `atgt_unit_ids`   | Optional list | Unit scope                                    |
| `atgt_area_ids`   | Optional list | Geographic scope                              |
| `atgt_case_ids`   | Optional list | Assigned-case scope                           |
| `atgt_data_class` | Yes           | Maximum data classification                   |
| `amr`             | Optional list | Step-up/MFA evidence interface                |

Signature verification is pinned to the configured issuer, audience and trusted
JWKS URI. Only RS256 and ES256 are accepted. Raw tokens and raw OIDC subjects are
not written to application logs or security audit metadata.

## Decision gates

- D-02 pending: `OIDC_USE_MOCK` is accepted only in development/test. Ops login
  stays closed until issuer, audience, JWKS and IdP claim mapping are approved.
- D-07 pending: `privacy.break_glass.approve` always denies. An MFA claim alone
  never enables unmasking.
- UI navigation is advisory only; the API guard and scoped repository remain the
  enforcement points.
