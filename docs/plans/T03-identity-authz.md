# T03 - Identity và authorization nền

## Outcome

Cán bộ được xác thực qua một identity-provider port có adapter OIDC/JWKS và ánh
xạ claims sang access scope đã chuẩn hóa. API áp dụng guard toàn cục, deny khi
route thiếu policy và kiểm tra role + unit + area + case + data class. Công dân
có anonymous session token xoay vòng; cơ sở dữ liệu chỉ giữ token hash.

## Source requirements

- REQ-08: RBAC/ABAC theo vai trò, địa bàn và vụ việc.
- T03 nguồn: OIDC officer identity, anonymous citizen session, policy engine,
  authentication/authorization audit, expired/revoked/rotation tests.
- ADR-004: business tables không chứa citizen technical identity; privacy vault
  tách riêng.
- Quy tắc repository: deny-by-default, UI không phải authorization, không log
  token hoặc identity data.
- D-02 chưa duyệt: mock OIDC chỉ được dùng trong development/test.
- D-07 chưa duyệt: break-glass luôn bị deny kể cả có MFA claim.

## Current state

- `packages/authorization` là policy engine thuần TypeScript, có branded
  `AccessScope` và repository helper bắt buộc scope đã resolve.
- `apps/api/src/modules/identity` có remote OIDC adapter xác minh issuer,
  audience, expiry/signature và JWKS; chỉ chấp nhận RS256/ES256.
- Claim mapping yêu cầu `sub`, `sid`, role, data class và nhận unit/area/case/amr.
  Principal reference là SHA-256 của cặp issuer + subject, không phải raw token.
- Local mock adapter so sánh opaque token constant-time và bị config chặn ngoài
  development/test.
- Global guard yêu cầu mỗi route phải có `@PublicRoute()` hoặc
  `@RequirePolicy()`; test coverage liệt kê toàn bộ controller hiện có.
- Authentication/authorization outcome được ghi append-only vào audit schema;
  event type không có trường token.
- Anonymous session API:
  - `POST /api/v1/public/sessions`
  - `POST /api/v1/public/sessions/rotate`
- Session response có `Cache-Control: no-store`; token 256-bit chỉ trả một lần,
  PostgreSQL lưu SHA-256 hash và rotation chạy trong transaction.
- Ops web hiển thị fail-closed auth shell cho đến khi D-02 được chốt.

## Change map

| Area           | Files                                           | Change                                             | Risk control                                                 |
| -------------- | ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Policy         | `packages/authorization`                        | RBAC action matrix, ABAC scopes, step-up interface | Deny by default and table-driven negative tests              |
| Runtime config | `packages/config`, env examples                 | Issuer/audience/JWKS/mock/session policy           | Mock rejected in staging/production; explicit session values |
| Identity       | `apps/api/src/modules/identity`                 | OIDC/mock adapters, guard, audit, citizen sessions | Fixed algorithms, trusted JWKS URI, token-free audit         |
| Contract       | `packages/contracts`                            | Session schemas, error codes and OpenAPI paths     | Strict Zod schemas and drift check                           |
| Persistence    | `infra/compose/postgres/04-identity-tables.sql` | Citizen token hashes and officer sid revocations   | No raw credential or citizen PII columns                     |
| Ops UI         | `apps/ops-web/app`                              | D-02 pending access shell                          | No UI-only authorization or fake production login            |

## Test plan and evidence

- Policy matrix: allow trace for each role and denials for missing principal,
  cross-area, cross-unit, cross-case, data class and separation of duties.
- Authentication: incomplete/unknown claims, wrong mock token and revoked sid.
- Guard: missing policy, explicitly public route, invalid token redaction,
  cross-area denial and successful scope attachment.
- Anonymous session: raw token not stored, expiry, revocation, atomic rotation and
  concurrent rotation single winner.
- Integration: PostgreSQL token hash/rotation, sid hash revocation and append-only
  token-free authentication audit after Compose cold start.
- Runtime smoke: create → rotate → old token returns 401 Problem Details.

## Rollout and rollback

- Production/staging cannot start with `OIDC_USE_MOCK=true`.
- D-02 must provide issuer, audience, JWKS URI and claim mapping before real staff
  login is enabled; local/test uses an explicit opaque mock credential.
- Deploy order: identity schema, config/contract packages, API, then ops web.
- Roll back application code first. Keep session and audit rows; do not delete
  audit history. Expired session hashes may be cleaned only after a later approved
  retention policy.

## Definition of done

- [x] Claims map to officer access scope.
- [x] Policy input covers role, unit, area, case and data class.
- [x] Repository helper rejects unresolved scope.
- [x] Authentication/authorization outcomes audited without token.
- [x] Missing policy and cross-scope matrices deny.
- [x] Expired/revoked sessions and anonymous rotation tested.
- [x] MFA/step-up interface exists; break-glass remains disabled.
- [x] No current route lacks an explicit public/protected declaration.
- [x] Cold-start integration and API runtime smoke pass.

## Handoff

Next task is T04 data platform/PostGIS. Real staff sign-in remains intentionally
blocked by D-02. T04 repositories must accept only branded `AccessScope`; they
must not introduce unscoped query overloads.
