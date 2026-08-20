# Security test matrix

## Automated and local evidence

| Threat                     | Automated/local evidence                                              | What it proves                                                                   | Remaining manual/external work                         |
| -------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| T1 fake SOS flood          | SOS idempotency/concurrency integration; bounded contracts            | Duplicate replay and bounded input do not amplify one request                    | Approved rate/captcha/risk/load policy (D-09)          |
| T2 evidence tamper         | Media worker clean/mismatch/duplicate tests                           | Magic, size, SHA-256, state/outbox atomicity in local/fake-AV mode               | Production AV/storage and legal-hold review            |
| T3 repudiation             | Audit append-only SQL grants and integration checks                   | App role cannot update/delete audit rows                                         | External log retention/export and auditor UAT          |
| T4 PII logging             | Contract/event negative tests; TruffleHog                             | Known sensitive fields/secrets are absent from defined payloads and commit range | Runtime log sampling in staging                        |
| T5 API key disclosure      | Config fail-closed tests; client contract review                      | Raw production secret config is rejected and public DTOs omit keys               | Secret resolver/provider deployment                    |
| T6 queue flood             | Outbox/inbox/DLQ integration                                          | Redelivery is idempotent and failed delivery has a DLQ path                      | Capacity, circuit breaker and chaos/load values (D-09) |
| T7 cross-area access       | Authorization traceability, route coverage and repository scope tests | Wrong area/unit/case and repeated Express route params fail closed               | Real IdP role/claim matrix and operator UAT            |
| T8 self-approval           | Map lifecycle maker-checker tests                                     | Draft author cannot approve its own governed change                              | Named production roles and break-glass process         |
| T9 upload capability theft | Initiate/finalize/session/HMAC negative tests                         | Raw capability is not persisted; wrong/expired capability is rejected            | Production TTL/key rotation and replay exercise        |
| T10 malicious media/EXIF   | Worker media integration                                              | Local JPEG/PNG derivative removes EXIF and fake detector blocks EICAR fixture    | Approved AV engine, MIME policy and production corpus  |
| T11 evidence IDOR          | Evidence access integration                                           | Guard plus persisted owner/area/case recheck and indistinguishable miss          | Authenticated DAST with real test accounts             |
| T12 cross-upload attach    | Report/evidence linking integration                                   | Session and two independent capabilities plus READY owner assignment             | Production capability secret resolver                  |
| T13 auto-conclusion        | Screening/operator decision tests                                     | Exact-SHA candidate remains suggestion-only; manual decision is versioned        | Approved heuristic policy if added later               |
| T14 stale/unsafe alert     | Traffic alert integration                                             | Only current valid published allowlisted projection is returned                  | Route/direction/cooldown and provider-backed testing   |

## Local OWASP ZAP API scan (2026-08-20)

- Target: local API with development/fake adapters and the executable OpenAPI
  document; ZAP 2.17.0 image digest
  `sha256:781a2bdaea47324e7bab583e2263f21d257b0aee61ed51521a5be45f5f5081ef`.
- Active scan imported 57 OpenAPI URLs and exercised 175 URLs. The first run had
  116 passed rules, 0 failed rules and 4 warnings.
- Helmet runtime hardening removed the `X-Powered-By`, missing
  `X-Content-Type-Options` and missing Cross-Origin-Resource-Policy warnings.
- Retest: 119 passed rules, 0 failed rules and 1 warning. The remaining warning is
  the expected 503 from the disabled traffic-alert feature; no ZAP ignore rule is
  configured, so the scan remains non-green rather than hiding it.
- Protected routes were exercised only as unauthenticated 401 boundaries. This is
  not evidence for real OIDC authorization, IDOR or business-role testing.

The local scan is useful regression evidence, not a staging pentest. Authenticated
DAST and manual OWASP API/ASVS/MASVS retest remain blocked by D-01/D-02/D-03/D-10
and approved test accounts.
