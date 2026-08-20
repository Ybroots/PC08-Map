# Dependency audit register

## 2026-08-20 T18A

Command: `pnpm audit --prod --json` from the repository root.

| State              | Total | Critical | High | Moderate | Low |
| ------------------ | ----: | -------: | ---: | -------: | --: |
| Before remediation |    39 |        0 |   16 |       20 |   3 |
| After remediation  |     3 |        0 |    2 |        1 |   0 |

Server/web highs were removed by upgrading to supported framework lines rather
than suppressing advisories: Next 16.3.1/React 19.2.8 and Nest 11.2.1 with
Express 5/Multer 2.2.0. UUID 11.1.1 and qs 6.15.2 remove two patchable moderate
findings.

## Open findings

| Advisory | Severity | Path                                                      | Patch status                                       | Release state                       |
| -------- | -------- | --------------------------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| 1138808  | High     | React Native 0.73.11 -> Metro 0.80.12 -> image-size 1.2.1 | No patched version (`<0.0.0`)                      | Unapproved RC blocker               |
| 1138809  | High     | React Native 0.73.11 -> Metro 0.80.12 -> image-size 1.2.1 | No patched version (`<0.0.0`)                      | Unapproved RC blocker               |
| 1117911  | Moderate | React Native CLI 12.3.7 -> fast-xml-parser 4.5.7          | Patched only after a major parser/toolchain change | Track with mobile toolchain upgrade |

The `image-size` findings concern parsers used by the mobile build toolchain. That
reachability context does not waive the findings: untrusted assets must not enter
the build context, and T18/RC remains blocked until upstream supplies a fix, the
build chain is replaced, or an authorized owner approves a bounded exception.
No audit ignore or local waiver is configured.
