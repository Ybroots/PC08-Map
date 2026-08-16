# ADR-010: Public Case Tracking

**Status**: ACCEPTED  
**Date**: 2026-08-16

## Decision

- Public tracking codes (`public_code`) are generated as random high-entropy strings (e.g. base32 CSPRNG, ~10 chars)
- Public API returns only general status (received / in-progress / completed / insufficient-basis)
- No sequential IDs or guessable codes exposed to public
- Rate limiting and anti-enumeration controls on tracking endpoint

## Consequences

- Citizens cannot enumerate cases
- No operational details exposed via tracking (no unit info, location, or investigation details)
- Code generation must use cryptographically secure random source
