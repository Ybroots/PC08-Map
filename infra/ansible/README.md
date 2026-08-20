# Ansible deployment contract - 09 VPS

T17A provides an executable, fail-closed inventory contract. It does not deploy
production services yet. Actual addresses, DNS, credentials, certificates and
secret material are intentionally absent from Git.

## VPS role map

| VPS   | Services                                                 | HA boundary                    |
| ----- | -------------------------------------------------------- | ------------------------------ |
| VPS01 | Edge A: HAProxy/Nginx/WAF                                | VIP failover with VPS02        |
| VPS02 | Edge B: HAProxy/Nginx/WAF                                | Failover/signed config sync    |
| VPS03 | VPN/Bastion/Ansible control                              | MFA/session record; no app     |
| VPS04 | API A, ops/public web, VietMap adapter, RMQ/Redis member | Stateless rolling deploy       |
| VPS05 | API B, ops/public web, VietMap adapter, RMQ/Redis member | Stateless rolling deploy       |
| VPS06 | Worker, RMQ quorum member, Redis/Sentinel member         | No public traffic              |
| VPS07 | PostgreSQL/PostGIS primary                               | PITR/encrypted volume          |
| VPS08 | PostgreSQL/PostGIS standby                               | Manual promotion; not a backup |
| VPS09 | Monitoring/log/Alertmanager/backup control               | App cannot delete logs         |

## Current executable boundary

`site.yml` imports only the preflight role. Preflight requires exactly the nine
documented nodes and group cardinalities, unique non-placeholder addresses, the
exact node-role mapping, a non-root deploy user, a staging/production environment,
an immutable `sha256:` OCI digest and opaque vault/external-secret references for
the secret bundle and TLS material.

The committed example must fail preflight until an operator copies it to ignored
`inventory.ini` and supplies approved values. Raw secrets and decrypted vault
files must never be stored in inventory or Git.

## Validation

Use Python 3.12 and install the pinned test tools:

```bash
python -m pip install -r infra/ansible/requirements-dev.txt
bash infra/ansible/tests/verify.sh
```

The verifier runs Ansible syntax and lint checks, executes the synthetic inventory
twice in check mode with `changed=0`, and proves the placeholder example is
rejected. It never connects to any VPS.

## Production hard stop

Do not add service roles or run a production play until D-01/D-10 and the actual
inventory, network zones, DNS/VIP, certificate issuer, secret backend, OS baseline,
capacity and backup targets are approved. T17B must then implement and stage-test
edge/app/queue/cache/database/monitoring roles, rolling deploy/rollback and restore
checks before any production apply.
