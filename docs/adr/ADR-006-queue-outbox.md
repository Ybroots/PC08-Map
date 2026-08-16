# ADR-006: Queue and Outbox

**Status**: ACCEPTED  
**Date**: 2026-08-16

## Decision

- Use **RabbitMQ quorum queues** on VPS04/05/06 for reliable messaging
- Use **PostgreSQL transactional outbox** pattern: domain event written in same transaction as state change; relay worker publishes to RabbitMQ
- All consumers are idempotent (check message_id / inbox dedup table)
- DLQ monitoring with P1 alert threshold

## Consequences

- No event loss on app crash between state change and publish
- RabbitMQ member loss tolerance = 1 node (quorum = 3)
- Worker relay uses advisory lock to prevent concurrent relay races
