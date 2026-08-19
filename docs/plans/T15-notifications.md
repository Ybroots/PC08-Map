# T15 - Notifications va contact fallback

## Outcome

T15A tao executable `notification.requested.v1` contract va application boundary
cho notification noi bo. Request chi dung opaque recipient reference, versioned
template, bounded allowlisted data va channel `INTERNAL`. Dispatcher port xu ly
preference, mandatory class, provider retry classification, idempotency va
delivery audit ma khong khoi tao provider/runtime nao.

T15 tong the chi DONE khi provider/channel D-08, template nghiep vu, persistence,
consumer/DLQ policy, contact directory, mobile deep link va UAT duoc phe duyet va
noi day du.

## Source requirements

- T15 source: provider ports, versioned templates, audience data allowlist,
  retry/DLQ/dedupe/preferences, contact fallback and delivery audit.
- REQ-03: notification la downstream cua SLA/escalation, khong nam trong SOS
  acceptance transaction.
- ADR-001: notifications o trong modular monolith va giao tiep qua public contract.
- ADR-006: producer dung outbox; consumer idempotent; retry bounded/DLQ monitored.
- AGENTS: khong log identity, token, signed URL, object key hoac case notes.

## Current state

- Routing key va durable RabbitMQ queue/DLQ `notifications` da co tu T01.
- Chua co data schema cho `notification.requested.v1`, template policy, delivery
  port, consumer, persistence, telemetry hoac provider adapter.
- D-08 PENDING co fallback chinh thuc `In-app/internal only`.

## Decisions and blockers

- D-08 PENDING: T15A chi cho `INTERNAL`; khong them SMS/email/push taxonomy,
  credential/config, SDK hay provider adapter.
- D-04 PENDING: khong tao SLA/escalation template hoac mandatory business rule.
- D-09 PENDING: khong dat concurrency, retry count, backoff, throughput hoac DLQ
  alert threshold.
- D-02 PENDING: recipient la opaque UUID; khong map IdP/email/phone/push token.
- Template definitions trong T15A la injected port; khong co production registry.

## Change map

| Area      | Files                                  | Change                                      | Risk                              |
| --------- | -------------------------------------- | ------------------------------------------- | --------------------------------- |
| Contracts | `packages/contracts/src/notifications` | strict internal requested event             | sensitive data crossing queue     |
| Worker    | `apps/worker/src/notifications`        | policy, ports, coordinator only             | duplicate/retry misclassification |
| Tests     | contract + worker specs                | audience/opt-out/duplicate/outage negatives | synthetic policy mistaken real    |
| Docs      | T15 plan + HANDOFF/README              | scope and blockers                          | overclaim T15 completion          |

## Implementation sequence

1. Add strict event data with opaque recipient, internal channel and citizen-safe
   template-data branch; export the exact event envelope.
2. Add versioned template definition validation and audience/data allowlist policy.
3. Add injected claim/template/preference/provider/audit ports and coordinator;
   keep it disconnected from worker bootstrap.
4. Test duplicate claims, wrong audience/data, optional opt-out, mandatory bypass,
   provider rate-limit/outage classification and safe audit payloads.
5. Run gates, review secrets/generated artifacts and record CI evidence.

## Test plan

- Unit/domain: template/version/audience/data key mismatch; opt-out rules.
- Contract/events: exact event v1; citizen operational detail and unknown fields deny.
- Failure/degraded: duplicate no-send; retryable provider releases claim; permanent
  failure completes claim; audit has no recipient/template data.
- Integration/runtime: none in T15A because no adapter, migration or bootstrap wiring.
- E2E/deep-link/contact directory: deferred to T15B after D-02/D-08.

## Rollout and rollback

- Feature flag: none; T15A has no runtime registration and cannot send anything.
- Migration: none. Event producers must not publish before a persisted consumer and
  approved template registry exist.
- Rollback: revert notification contract/worker foundation; existing unused queue
  and routing key remain compatible.

## Definition of done

- [x] Strict internal-only requested event and citizen data allowlist.
- [x] Versioned template/audience/preference policy is executable.
- [x] Idempotent dispatcher ports classify duplicate/retry/permanent outcomes.
- [x] Audit payload excludes recipient reference and rendered/template data.
- [x] Full local gates and GitHub CI pass; T15B blockers stay explicit.

## Progress log

- [x] 2026-08-19: source, ADR, current state and T15A boundary reviewed.
- [x] T15A implementation and local/Linux verification.
- [x] Implementation `e0ee0c0`; GitHub CI `32239395995` passed all six jobs.

## Handoff

- Changed files: notification contract/OpenAPI, worker policy/ports/dispatcher,
  deterministic tests and project/handoff docs.
- Tests run/results: contract 30/30; focused notification 9/9; full unit/coverage,
  contract/e2e/build, API integration 70/70, worker integration 9/9; clean Linux
  coverage 19/19 workspace tasks. GitHub CI `32239395995` passed 6/6 jobs.
- Remaining risks: D-02/D-04/D-08/D-09, provider security review, persistence,
  contact directory/deep links and operator/citizen UAT.
- Rollback: no runtime change; revert T15A foundation files.
