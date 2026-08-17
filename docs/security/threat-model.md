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

| ID  | Category               | Threat                   | Current control                                             | Residual risk |
| --- | ---------------------- | ------------------------ | ----------------------------------------------------------- | ------------- |
| T1  | Spoofing               | Fake SOS flood           | Rate limit, risk score, duplicate detection                 | Medium        |
| T2  | Tampering              | Evidence modification    | DB integrity trigger + SHA256 + versioned original          | Medium        |
| T3  | Repudiation            | Deny action taken        | Append-only audit log                                       | Low           |
| T4  | Info disclosure        | PII in logs              | Structured logging allowlist                                | Medium        |
| T5  | Info disclosure        | API key in bundle        | Secret store + key alias                                    | Low           |
| T6  | Denial of service      | Queue flood              | Rate limit + DLQ + circuit breaker                          | Medium        |
| T7  | Elevation of privilege | Cross-area access        | ABAC + scoped repository                                    | Low           |
| T8  | Elevation of privilege | Self-approve data        | Maker-checker (4 eyes)                                      | Low           |
| T9  | Spoofing/tampering     | Stolen upload capability | Citizen session + short TTL + HMAC capability; hash-only DB | Medium        |

## Pentest scope (T18)

- OWASP API Security Top 10
- OWASP ASVS subset (Level 2)
- OWASP MASVS subset (mobile)
- Manual: IDOR, upload bypass, authz logic, business rules
- Tools: SAST, DAST, SCA, container scan, IaC scan
