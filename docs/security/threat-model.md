# Threat Model - ATGT Lam Dong Platform

**Status**: DRAFT — Update before T18 security hardening

## System overview

Ban do so va ung dung an toan giao thong tinh Lam Dong.
Five user groups: citizen/tourist, dispatcher, field officer, leader, system admin.

## Assets to protect

| Asset                    | Classification   | Owner            |
| ------------------------ | ---------------- | ---------------- |
| SOS incident data        | Sensitive        | incidents module |
| Citizen identity linkage | Highly sensitive | privacy vault    |
| Evidence files           | Sensitive        | evidence module  |
| Dispatch unit locations  | Internal         | dispatch module  |
| VietMap API keys         | Secret           | vietmap-client   |
| Officer credentials      | Secret           | identity module  |

## Trust boundaries

1. Public internet -> Edge (HAProxy/WAF) -> API
2. API -> Database (internal network, TLS)
3. API -> RabbitMQ (internal network, TLS)
4. Worker -> Object storage (internal/S3, TLS)
5. API/Worker -> VietMap (egress allowlist)

## Threat register (STRIDE)

| ID  | Category               | Threat                    | Current control                                                                              | Residual risk |
| --- | ---------------------- | ------------------------- | -------------------------------------------------------------------------------------------- | ------------- |
| T1  | Spoofing               | Fake SOS flood            | Rate limit, risk score, duplicate detection                                                  | Medium        |
| T2  | Tampering              | Evidence modification     | Magic/size/SHA256 checks + conditional put + versioned original                              | Medium        |
| T3  | Repudiation            | Deny action taken         | Append-only audit log                                                                        | Low           |
| T4  | Info disclosure        | PII in logs               | Structured logging allowlist                                                                 | Medium        |
| T5  | Info disclosure        | API key in bundle         | Secret store + key alias                                                                     | Low           |
| T6  | Denial of service      | Queue flood               | Rate limit + DLQ + circuit breaker                                                           | Medium        |
| T7  | Elevation of privilege | Cross-area access         | ABAC + scoped repository                                                                     | Low           |
| T8  | Elevation of privilege | Self-approve data         | Maker-checker (4 eyes)                                                                       | Low           |
| T9  | Spoofing/tampering     | Stolen upload capability  | Citizen session + short TTL + HMAC capability; hash-only DB                                  | Medium        |
| T10 | Tampering/disclosure   | Malicious media/EXIF leak | Quarantine + AV port + EXIF-free watermarked derivative                                      | Medium        |
| T11 | Info disclosure        | Evidence IDOR/signed URL  | Area+case ABAC, repository recheck, short TTL, access audit                                  | Medium        |
| T12 | Spoofing/tampering     | Attach another upload     | Live session + separate report/upload HMAC capabilities + READY-only atomic owner assignment | Medium        |

T10B2 implements the T2/T10 controls only for explicit local/test JPEG/PNG values
and a fake EICAR detector. Production remains fail-closed until the AV/storage
provider, secret resolver and D-09 limits are approved. Quarantine retention and
legal-hold behavior remain pending D-06; no automatic deletion path exists.

T10B3 implements the T11 control locally: the guard evaluates `evidence.view`,
then the repository matches persisted owner/area and reevaluates actual data class.
Scope miss and missing evidence share the same response. Signed URLs are returned
only to the caller, use `no-store`/`no-referrer`, and are excluded from audit and
aggregate metrics. URL forwarding within its short lifetime remains a residual
risk; production TTL/provider controls still require approval.

T11B1 implements T12 only for local/test. Report and upload capabilities are
verified independently; raw capabilities are not written to report, evidence,
audit or outbox rows. Invalid capability, non-READY media and owner conflict are
intentionally indistinguishable. Production remains fail-closed pending the
T10/D-09 gates.

## Pentest scope (T18)

- OWASP API Security Top 10
- OWASP ASVS subset (Level 2)
- OWASP MASVS subset (mobile)
- Manual: IDOR, upload bypass, authz logic, business rules
- Tools: SAST, DAST, SCA, container scan, IaC scan
