# T18 - Security hardening va release candidate

## Outcome

T18A giam dependency exposure co bang chung truoc khi them blocking SCA gate.
T18A1 nang Next/React va Nest/Express/Multer len patched lines, chay full contract,
authorization, cold-start, web/native build va audit lai. T18A2 xu ly mobile Metro
`image-size` high advisory; neu upstream chua co fix thi release candidate van bi
khoa cho den khi co approved exception hoac thay build chain.

T18 tong the chi DONE khi threat model/data flow, SAST/DAST/SCA/container/IaC,
SBOM/provenance, manual authz/upload/business retest va ATTT action list co owner;
khong co Critical/High mo ma chua duoc phe duyet.

## Source requirements

- Source section 10/12: security/privacy, OWASP API/ASVS/MASVS and UAT evidence.
- T18 backlog: STRIDE/data flow; SAST/DAST/SCA/container/IaC; P0/P1 fixes;
  approved exceptions; SBOM/build provenance.
- Definition of Done: no Critical/High without approval, retest evidence and owned
  ATTT action list.
- Official Next 15/16 and Nest 11 migration guides for breaking changes.

## Current state

- Secret scan, authorization-negative tests, strict contracts, fail-closed config,
  evidence controls and Ansible production lint exist.
- CI has secret/Ansible gates. T18A3 adds CodeQL SAST, GitHub Actions policy
  scanning and a pinned CycloneDX source SBOM; SCA/DAST/container gaps remain.
- Baseline `pnpm audit --prod`: 39 advisories (16 high, 20 moderate, 3 low,
  0 critical). After T18A1: 3 advisories (2 high, 1 moderate, 0 critical).
- Both remaining highs are Metro transitive `image-size` 1.2.1 advisories with
  `patched_versions: <0.0.0`; the remaining moderate is React Native CLI
  build-time `fast-xml-parser` 4.5.7 and requires a major dependency change.
- Threat register now states that rate/risk/captcha/circuit-breaker controls are
  not implemented or approved; T1/T5/T6 remain High.

## Decisions and blockers

- D-02/D-03/D-06/D-07/D-08/D-09 block production identity/provider/retention/
  break-glass/notification/load assertions and several manual tests.
- D-10 PENDING: do not claim an ATTT level or release-candidate approval.
- No local waiver may hide a Critical/High. Upstream-without-fix stays an explicit
  release blocker until an authorized owner approves a bounded exception.

## Change map

| Area       | Files                         | Change                            | Risk                   |
| ---------- | ----------------------------- | --------------------------------- | ---------------------- |
| Web        | web package manifests/lock    | Next 16.3.1 + React 19            | App Router/Turbopack   |
| API        | API manifest/AppModule/lock   | Nest 11/Express 5/Multer 2.2      | route matching/adapter |
| Mobile     | audit evidence/build controls | isolate unresolved image parser   | CI asset DoS           |
| Security   | threat/advisory docs          | honest exposure and blockers      | false compliance claim |
| CI (later) | security workflow             | SCA/SAST/IaC/SBOM only when green | noisy or bypassed gate |

## Implementation sequence

1. Capture machine-readable production audit baseline and reachable package paths.
2. Upgrade web framework/runtime/types; apply only required Next 15 migration.
3. Upgrade Nest packages; change Express 5 wildcard middleware route explicitly.
4. Run focused then full local/cold-start/web/native gates and audit again.
5. Resolve remaining high advisories or record them as unapproved RC blockers.
6. Add reproducible security CI/SBOM gates only after they pass without hiding high.

## Test plan

- Unit/type: all workspaces plus API route-policy coverage.
- Integration: cold-start API 70/70 and worker 9/9 after Express 5 migration.
- Web: both Next production builds and browser smoke of ops routes.
- Mobile: tests, Metro Android bundle and debug build when toolchain changes.
- Security: `pnpm audit --prod`, TruffleHog, SAST/IaC/SBOM gates as introduced.
- Negative: wildcard middleware still covers public/protected/not-found paths.

## Rollout and rollback

- No feature flag or database migration. Framework changes deploy as one app image.
- Rollback package manifests/lock + explicit wildcard change together.
- No production rollout/release tag while any unapproved high or D-10 remains open.

## Definition of done

- [x] Server/web high advisories removed without skipped audit entries.
- [x] Full contract/authorization/cold-start/build gates pass after framework majors.
- [ ] Mobile build-chain highs fixed or remain explicit unapproved RC blockers.
- [x] Threat model describes implemented controls only.
- [x] Pinned CodeQL/Checkov/CycloneDX automation runs successfully; limitations
      are explicit and do not claim alert triage or signed provenance.
- [ ] Reproducible SCA/SAST/IaC/SBOM gates pass; DAST/manual gaps explicit.
- [ ] No Critical/High remains open without authorized approval.

## Progress log

- [x] 2026-08-20: source/current-state review and production audit baseline captured.
- [x] T18A1 server/web dependency remediation implemented locally: Next 16.3.1,
      React 19.2.8, Nest 11.2.1, Terminus 11.1.1, Multer 2.2.0, UUID 11.1.1 and
      Express-compatible qs 6.15.2. Focused type/unit/build gates pass.
- [x] Full format/lint/typecheck, 19/19 coverage tasks, contract 30/30, e2e,
      13/13 build tasks, service restart, API integration 70/70 and worker 9/9 pass.
- [x] T18A1 published at `9d3663f`; GitHub CI run `32333158608` passed 7/7.
- [x] T18A3 published at `b716b36`: pinned CodeQL, Checkov workflow policy and
      Syft CycloneDX jobs. Checkov local passed 232/232; Security run `32334099209`
      passed 3/3 and CI run `32334099211` passed 7/7.
- [x] T18A4 published at `1169360`: data-flow/security matrix and unauthenticated
      active ZAP retest cover 175 URLs with 119 rule passes, 0 failures and one
      explicit fail-closed 503 warning. Helmet header regression passes;
      authenticated staging DAST remains blocked.
- [x] CI run `32335266014` exposed a fresh-install React 18/19 type leak hidden by
      local Turbo cache. Commit `4de0c81` pins pnpm 9.15.9 and gives React Native
      its own React 18 type dependency. Fresh Linux mobile coverage passes 9/9
      suites and 36/36 tests; replacement CI run `32336361409` passes 7/7 and
      Security run `32336361352` passes 3/3.
- [x] T18A5 implementation pins every external action in `CI` and `Security`
      to an immutable commit, upgrades first-party setup actions to their Node 24
      lines and pins both the TruffleHog action and CLI at 3.97.0. The repository
      workflow-pin regression passes; pinned Checkov passes 236/236. Full frozen
      install, quality, forced no-cache coverage (19/19), contract 30/30,
      integration API 70/70 + worker 9/9, e2e and build 13/13 pass.
      Published at `14b0ee8`; CI run `32337368832` passes 7/7 and Security run
      `32337368847` passes 3/3.

## Handoff

- Changed files: API/web/mobile manifests and lock; Express 5 wildcard/param
  compatibility; Next monorepo config; security workflows/gate docs; threat model
  and this plan. T18A5 additionally changes both GitHub Actions workflows, the
  root gate manifest and `scripts/verify-workflow-pins.js`.
- Tests run/results: full quality/coverage/contract/e2e/build pass; restarted
  8-service stack is healthy; API integration 70/70 and worker 9/9 pass. Audit
  reduced from 39 total / 16 high / 0 critical to 3 total / 2 high / 0 critical.
  GitHub CI run `32333158608` passed 7/7.
  T18A3 Security run `32334099209` passed 3/3 with a 114,984-byte SBOM artifact;
  matching CI run `32334099211` passed 7/7.
  T18A4 replacement CI run `32336361409` passed 7/7 and Security run
  `32336361352` passed 3/3 after a forced no-cache workspace coverage pass.
  T18A5 commit `14b0ee8`: local Checkov passed 236/236; CI run `32337368832`
  passed 7/7 and Security run `32337368847` passed 3/3.
- Remaining risks: Metro `image-size` has no patched version in current advisory;
  authenticated DAST/container scans need deployable images/staging; D-10/ATTT
  review pending.
- Rollback: revert framework manifests/lock and compatibility edits together.
