# ADR-001: Modular Monolith vs Microservices

**Status**: ACCEPTED  
**Date**: 2026-08-16  
**Deciders**: Tech Lead, Architect

## Context

MVP timeline 10-14 weeks on 09 fixed VPS. Small team. Need HA but not distributed complexity.

## Decision

Use a **modular monolith** (NestJS) with clear module boundaries, shared-nothing internal repos, and domain events.
Extract to microservices ONLY when there is evidence of: load isolation need, independent team ownership, or risk isolation requirement — AND only after an ADR is approved.

## Consequences

- Single deployable unit simplifies ops for MVP
- Rolling deploy on 2 app nodes (VPS04/05)
- Module boundaries enforced by code rules, not network
- Future extraction path: outbox events + anti-corruption layers already in place

## Criteria to revisit

- A module needs independent scaling beyond 2x app nodes
- A team owns a module end-to-end with separate release cadence
- A risk isolation requirement (e.g. ATTT classification) mandates separation
