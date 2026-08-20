#!/usr/bin/env bash
set -euo pipefail

ansible_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ansible_root"
export ANSIBLE_CONFIG="$ansible_root/ansible.cfg"
export ANSIBLE_ROLES_PATH="$ansible_root/roles"

ansible-playbook -i tests/inventory.valid.ini site.yml --syntax-check
ansible-lint

for pass in first second; do
  output="$(ansible-playbook -i tests/inventory.valid.ini site.yml --check)"
  if ! grep -Eq 'changed=0[[:space:]]+unreachable=0[[:space:]]+failed=0' <<<"$output"; then
    echo "Synthetic inventory $pass check-mode run was not idempotent" >&2
    echo "$output" >&2
    exit 1
  fi
done

negative_dir="$(mktemp -d)"
trap 'rm -rf "$negative_dir"' EXIT

assert_rejected() {
  local label="$1"
  local inventory="$2"
  if ansible-playbook -i "$inventory" site.yml --check >/dev/null 2>&1; then
    echo "$label unexpectedly passed preflight" >&2
    exit 1
  fi
}

assert_rejected "Placeholder inventory" inventory.ini.example

sed 's/ansible_user=synthetic_deploy/ansible_user=root/' \
  tests/inventory.valid.ini >"$negative_dir/root-user.ini"
assert_rejected "Root deploy user" "$negative_dir/root-user.ini"

sed 's/atgt_release_digest=sha256:.*/atgt_release_digest=latest/' \
  tests/inventory.valid.ini >"$negative_dir/mutable-release.ini"
assert_rejected "Mutable release" "$negative_dir/mutable-release.ini"

sed 's/atgt_deployment_environment=staging/atgt_deployment_environment=development/' \
  tests/inventory.valid.ini >"$negative_dir/unsupported-environment.ini"
assert_rejected "Unsupported deployment environment" \
  "$negative_dir/unsupported-environment.ini"

sed 's#atgt_secret_bundle_ref=vault://.*#atgt_secret_bundle_ref=raw-secret-value#' \
  tests/inventory.valid.ini >"$negative_dir/raw-secret.ini"
assert_rejected "Raw secret value" "$negative_dir/raw-secret.ini"

sed '/^atgt_tls_private_key_ref=/d' \
  tests/inventory.valid.ini >"$negative_dir/missing-secret-reference.ini"
assert_rejected "Missing secret reference" \
  "$negative_dir/missing-secret-reference.ini"

sed 's/ansible_host=192.0.2.2/ansible_host=192.0.2.1/' \
  tests/inventory.valid.ini >"$negative_dir/duplicate-address.ini"
assert_rejected "Duplicate address" "$negative_dir/duplicate-address.ini"

sed 's/atgt_node_role=app_b/atgt_node_role=app_a/' \
  tests/inventory.valid.ini >"$negative_dir/wrong-role.ini"
assert_rejected "Wrong node role" "$negative_dir/wrong-role.ini"

sed '/^vps09 /d' tests/inventory.valid.ini >"$negative_dir/missing-host.ini"
assert_rejected "Missing inventory host" "$negative_dir/missing-host.ini"

sed \
  -e 's/^vps02 ansible_host/vps03 ansible_host/' \
  -e 's/^vps03 ansible_host/vps02 ansible_host/' \
  tests/inventory.valid.ini >"$negative_dir/wrong-group.ini"
assert_rejected "Wrong group membership" "$negative_dir/wrong-group.ini"

echo "Ansible syntax, lint, idempotent preflight and fail-closed negatives passed"
