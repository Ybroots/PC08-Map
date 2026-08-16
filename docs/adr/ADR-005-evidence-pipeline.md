# ADR-005: Evidence Pipeline

**Status**: ACCEPTED  
**Date**: 2026-08-16

## Decision

Evidence lifecycle: **Quarantine → Scan → Original (immutable) → Derivative**

- Upload creates object in quarantine bucket (not readable by application)
- Worker validates: magic bytes, MIME, size, SHA-256 hash, antivirus scan
- On pass: object moves to `evidence-original` bucket (immutable, versioned)
- Derivative (thumbnail, watermarked preview) generated separately
- Original checksum is never overwritten

## Consequences

- Application cannot read quarantine bucket directly
- Signed URLs are short-lived and access-audited
- Legal hold blocks archive/delete jobs
