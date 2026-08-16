# RB-08 - VietMap outage, quota and key rotation

**Status**: SAFE DRAFT — real-provider steps require approved D-03 values before
pilot go-live.

## Trigger conditions

- Map provider timeout, rate-limit, 5xx or malformed-response error increases.
- A configured quota percentage threshold emits an alarm.
- Circuit for search, reverse, route or matrix opens.
- A server/client credential is suspected exposed or requires planned rotation.

Provider failure is not a core-health failure. SOS acceptance must remain
available; provider-dependent ETA/search can be cached, degraded or unavailable.

## Prerequisites

- Authorized on-call access defined by the approved operations policy.
- Metrics by environment, key alias and API; application logs by stable provider
  error code. Never paste raw requests, upstream URLs or credentials into tickets.
- Secret-store and VietMap Console access after D-03 names the approved systems.
- Approved contract quota, cache/license and credential-rotation procedure.

## Outage response

1. Confirm core API health and an SOS synthetic check independently of VietMap.
2. Identify affected environment/API and distinguish timeout, 429, 5xx,
   malformed response and local egress/DNS failure using sanitized telemetry.
3. Confirm circuit/cache behavior: live calls may fail fast; only data inside the
   approved max-stale window may return as `DEGRADED`.
4. Disable provider-dependent UI actions if no bounded fallback remains. Do not
   enable the fake adapter in production as substitute data.
5. Notify the role/channel recorded in the approved incident policy. Escalation
   timing is deliberately not specified while the policy is pending.
6. After provider recovery, allow the half-open probe; confirm it succeeds and
   circuit state returns to closed before declaring recovery.

## Quota response

1. Validate `used`, `limit`, environment, key alias and API against provider
   contract data; do not extrapolate a missing limit.
2. Check for retry storms, accidental duplicated calls and unexpected traffic.
3. Reduce or disable non-critical provider-backed work using an approved feature
   flag. Never block emergency intake.
4. A quota/pricing increase requires owner approval; operators must not invent a
   temporary limit or bypass the provider contract.
5. Verify each configured threshold alerts once and resets according to the
   monitoring period defined after D-03.

## Credential rotation

These steps may only be executed after D-03 documents the key type and VietMap
Console/secret-store process.

1. Create or obtain a replacement credential with the minimum approved API,
   environment, domain/IP/package restrictions.
2. Store the secret in the approved secret store. Configuration contains only a
   reference/alias; never commit or print the secret.
3. Deploy the new reference using the approved overlap procedure and validate
   all permitted APIs through sanitized synthetic checks.
4. Revoke the previous credential only after the new one is proven active on all
   application nodes.
5. Run repository/bundle/log scans for leakage and document the rotation without
   including either credential.

## Verification

- Core health and accepted SOS path remain successful.
- Provider calls return `LIVE` after recovery; cache/degraded status is visible
  while recovering and never exceeds max-stale.
- Error, latency, circuit and quota telemetry separates API/environment/alias.
- Old credential is revoked and absent from source, artifacts, logs and tickets.

## Rollback and escalation

- Roll back the application/config reference to the last known-good credential
  only if it remains valid and policy permits it; otherwise keep provider-backed
  functionality unavailable while core flows continue.
- Contact roles, response deadlines and vendor escalation details remain a
  mandatory D-03/pilot input and must be filled before this runbook becomes
  `APPROVED`.

## Post-incident

- Record timestamps, stable error codes, affected APIs, quality states and user
  impact without raw queries or secrets.
- Review retry/cache/circuit behavior and update this runbook through approval.
