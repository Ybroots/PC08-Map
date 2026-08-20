# T17 - Production infrastructure as code

## Outcome

T17A tao executable fail-closed contract cho inventory 09 VPS. Preflight xac minh
exact host/group/role map, unique address, non-root deploy user, immutable OCI
digest va secret/TLS reference. Synthetic inventory pass hai lan check-mode khong
drift; committed placeholder bat buoc fail. T17A khong deploy service production.

T17 tong the chi DONE sau khi co approved inventory/network/DNS/certificate/secret
backend/OS/capacity, idempotent service roles, staging deploy twice, backup/restore
va rolling deploy/rollback evidence.

## Source requirements

- Source section 11.1-11.4: 09 VPS mapping, pipeline, monitoring and runbooks.
- T17 backlog: separate secrets/inventory/environment, idempotent roles/dry-run,
  edge/app/queue/cache/database/observability and backup verification.
- ADR-007: PostgreSQL primary/standby, PITR, manual promotion.
- ADR-008: Ansible + OCI + systemd/Compose; rolling app and drained worker.

## Current state

- Local Compose and operational runbook stubs exist.
- `infra/ansible` previously contained only a placeholder inventory and README with
  commands for playbooks that did not exist.
- No granted infrastructure, production inventory, service role, certificate,
  secret backend, backup target or staging environment is available.

## Decisions and blockers

- D-01 PENDING: reference stack is not production-approved; T17A validates only.
- D-02/D-03/D-06/D-08/D-09 affect IdP/provider/retention/notification/capacity.
- D-10 PENDING: no ATTT compliance or production hardening claim.
- Missing inventory/network/DNS/cert/secret/OS/capacity: do not add service roles or
  production apply. All unknowns remain required external inputs.

## Change map

| Area      | Files                        | Change                              | Risk                       |
| --------- | ---------------------------- | ----------------------------------- | -------------------------- |
| Inventory | example + synthetic fixture  | exact 09-node contract              | placeholder used as real   |
| Ansible   | site/preflight role/config   | fail-closed validation only         | mistaken deploy capability |
| CI        | workflow + pinned test tools | syntax/lint/check-mode/reject test  | tool drift                 |
| Security  | `.gitignore`, opaque refs    | keep inventory/decrypted data local | secret committed           |
| Docs      | README/plan/HANDOFF          | scope and external gates            | overclaim T17 complete     |

## Implementation sequence

1. Define exact host/group/role and required deployment-variable contract.
2. Reject placeholders, root user, mutable image reference and raw secret fields.
3. Add synthetic documentation-range inventory and idempotent preflight role.
4. Run Ansible syntax/lint, two check-mode passes and negative placeholder test.
5. Wire the same verifier into CI and record evidence/blockers.

## Test plan

- Static: ansible syntax and production-profile ansible-lint.
- Positive: synthetic exact inventory passes check mode twice with `changed=0`.
- Negative: committed placeholder inventory fails preflight.
- Security: root/mutable digest/non-reference values fail assertions; secret scan.
- Repository regression: existing format/lint/typecheck/unit/contract/integration/build.

## Rollout and rollback

- No deployment tasks, migration or remote connection in T17A.
- T17B roles must be staged and applied twice with no drift before production.
- Rollback T17A removes validation files/CI job only; runtime is unchanged.

## Definition of done

- [x] Exact 09-node inventory and group/role mapping fail closed.
- [x] Immutable release and opaque secret/TLS references are mandatory.
- [x] Syntax/lint/two check-mode passes and placeholder rejection pass.
- [x] CI and repository gates pass with no secret finding.
- [x] T17B production inputs and unimplemented roles remain explicit.

## Progress log

- [x] 2026-08-19: current state, source and hard-gate review complete.
- [x] 2026-08-20: T17A implementation and local verification complete.
- [x] 2026-08-20: implementation `56b3db2` published; CI run `32331465121`
      green 7/7.

## Handoff

- Changed files: Ansible config/site/preflight role, exact example + synthetic
  inventory, verifier, pinned tools, CI job, ignore rules and handoff docs.
- Tests run/results: syntax pass; production ansible-lint 0 failure/0 warning;
  synthetic check-mode twice `changed=0`; ten fail-closed negative categories;
  repository format/lint/typecheck/coverage/contract/e2e/build/integration pass.
  GitHub CI run `32331465121` passed all seven jobs for implementation `56b3db2`.
- Remaining risks: all service roles, actual staging/production deployment,
  certificates/secrets, replication/PITR, monitoring, backup/restore and UAT-26..30.
- Rollback: no remote change; revert T17A validator and CI job.
