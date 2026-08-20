# Security gates

## Automated security jobs

The `Security` GitHub Actions workflow runs on pushes to `main`, pull requests and
manual dispatch:

- CodeQL analyzes JavaScript and TypeScript and uploads results to GitHub code
  scanning. A green job proves analysis delivery, not that ATTT triaged every
  alert.
- Checkov rejects GitHub Actions policy violations. The scanner image and every
  external action in both `CI` and `Security` are pinned to immutable commit or
  image digests. `pnpm test:workflow-pins` independently rejects mutable action
  references so this invariant does not depend on Checkov coverage alone.
- Syft generates a CycloneDX JSON source SBOM and retains the workflow artifact
  for 14 days. The action commit and Syft version are pinned. This is inventory
  evidence, not signed release provenance.

The existing CI also blocks on TruffleHog secret findings and the executable
Ansible syntax/lint/idempotency/fail-closed verifier. Both the TruffleHog action
commit and its CLI version are pinned; this avoids the action's `latest` CLI
default.

## Explicit gaps

- Repo-wide SCA at High cannot be a green blocking gate while advisories 1138808
  and 1138809 have no patched `image-size` version. `pnpm audit --prod` remains a
  required local/manual release check, with findings tracked in
  `dependency-audit.md`. No ignore or `continue-on-error` is allowed.
- Local unauthenticated ZAP API evidence exists in `security-test-matrix.md`.
  Authenticated/staging DAST still requires approved identity/provider settings
  and test accounts; those are blocked by D-01/D-02/D-03/D-10.
- Container scanning and signed image provenance begin when production
  Dockerfiles/images exist. The local Compose services are third-party
  development dependencies, not ATGT release images.
- Ansible is governed by the dedicated verifier. Checkov currently discovers no
  applicable Ansible resources in the T17A preflight-only skeleton, so the
  workflow does not claim an Ansible Checkov gate.

These gaps keep T18 and release-candidate approval open even when the automated
workflow is green.

## Verification evidence

- T18A5 local workflow-pin gate passed. Pinned Checkov scanned 236 GitHub Actions
  checks with 0 failures. Frozen install, format, lint, typecheck, forced no-cache
  coverage (19/19 tasks), contract (30/30), integration (API 70/70 and worker
  9/9), e2e and build (13/13 tasks) passed.
- Security run `32334099209`: CodeQL, Checkov and CycloneDX jobs passed 3/3.
- The SBOM artifact for commit `b716b36` is 114,984 bytes and is retained by the
  workflow for 14 days.
- CI run `32334099211` passed all 7 quality, test, build, secret and infrastructure
  jobs for the same commit.
