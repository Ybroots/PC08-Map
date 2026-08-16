# Ansible Deployment - 09 VPS

## VPS Role Map

| VPS   | Services                                                 | HA                               |
| ----- | -------------------------------------------------------- | -------------------------------- |
| VPS01 | Edge A: HAProxy/Nginx/WAF                                | VIP failover with VPS02          |
| VPS02 | Edge B: HAProxy/Nginx/WAF                                | Failover/sync                    |
| VPS03 | VPN/Bastion/Ansible control                              | MFA, session record, no app      |
| VPS04 | API A, ops/public web, VietMap Adapter, RMQ/Redis member | Stateless; rolling deploy        |
| VPS05 | API B, ops/public web, VietMap Adapter, RMQ/Redis member | Stateless; rolling deploy        |
| VPS06 | Worker, RMQ quorum member, Redis/Sentinel member         | Jobs idempotent                  |
| VPS07 | PostgreSQL/PostGIS primary                               | PITR, encrypted volume           |
| VPS08 | PostgreSQL/PostGIS standby                               | Near-sync; promotion via runbook |
| VPS09 | Prometheus/Grafana/logs/Alertmanager/backup              | App cannot delete logs           |

## Prerequisites

- Ansible >= 2.15
- VPS accessible from VPS03 (bastion)
- SSH keys provisioned
- Secrets in vault (NOT in inventory)

## Usage

```bash
# Dry run
ansible-playbook -i inventory.ini site.yml --check

# Deploy
ansible-playbook -i inventory.ini site.yml

# Rolling app deploy
ansible-playbook -i inventory.ini app-deploy.yml -e "version=1.2.3"

# Rollback
ansible-playbook -i inventory.ini app-rollback.yml -e "version=1.2.2"
```

## IMPORTANT

- Never store secrets in inventory files; use ansible-vault or external secret store
- All roles must be idempotent (safe to run multiple times)
- Run dry-run first, verify diff, then apply
- Document changes in change log after each deployment
