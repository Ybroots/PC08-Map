# T14 - Ops workspace hoan chinh

## Outcome

T14A tao read-only incident workspace co executable client boundary: feed duoc
validate theo contract, resume bang monotonic cursor, dedupe khi poll/reconnect,
bao stale/contract/auth failure ro rang va navigation duoc tao tu role capability.
UI local dung synthetic fixture va khong tu nhan la realtime/dispatch production.

T14 tong the chi DONE khi identity, dispatch/SLA, evidence workflow, realtime va
UAT operator duoc phe duyet va noi day du.

## Source requirements

- T14 source: queue filter/cursor, incident panels, reconnect/resume/conflict,
  scope-aware map, sensitive action reason, role/API/concurrency/large-data/a11y.
- REQ-02/03/04: ops intake, dispatch and role-scoped access.
- ADR-001: UI noi modular-monolith API qua executable contract.
- ADR-003: dispatch operator-confirmed; khong auto-assign khi rule chua approved.
- AGENTS: UI hiding khong thay the API authorization; timestamp hien Asia/Ho_Chi_Minh.

## Current state

- API co strict `OpsIncidentFeedSchema`, monotonic cursor va scoped feed/transition.
- Authorization guard/repository recheck role, area va actual data class.
- Ops web co static synthetic `/incidents` shell, chua co client adapter/state model,
  resume/dedupe/stale/failure handling hoac tests.
- T08 dispatch/SLA van BLOCKED; evidence viewer co backend nhung chua co approved
  end-user authentication/UAT.

## Decisions and blockers

- D-02 PENDING: khong them production login/token storage/claim mapping. T14A client
  nhan bearer tu caller port va khong log/persist; static local fixture la mac dinh.
- D-04/D-05 PENDING: khong assignment/reassignment/SLA/escalation/candidate UI.
- D-09 PENDING: khong dat polling/realtime/virtualization threshold mac dinh. T14A
  manual refresh; bounds nhan tu caller va feed contract van cap 100.
- D-06/D-07 PENDING: khong retention/unmask UI.

## Design direction

- Subject/audience/job: ban tiep nhan tin bao Lam Dong cho dispatcher; mot viec la
  thay tin moi, giu dung cursor va biet ngay du lieu co con moi hay khong.
- Palette: `Night asphalt #0C1B21`, `Da Lat fog #E7EEF0`, `Lane amber #F0B429`,
  `Emergency vermilion #D64A3A`, `Lake teal #1B7268`, `Signal paper #F8FAF9`.
- Type: Bahnschrift/Arial Narrow cho heading; Segoe UI cho noi dung; Consolas cho
  cursor/timestamp. Khong tai web font trong production build.
- Layout: queue 34% / incident-map 46% / resume rail 20%; mobile chuyen thanh mot
  cot theo thu tu queue -> selected incident -> connection state.
- Signature: lane-like resume rail noi cac cursor; stale/resync cat dut duong rail,
  khong dung trang tri dashboard chung chung.
- Self-critique: bo KPI cards/gradient/animation ambient vi khong giup triage; chi
  giu mot pulse nho cho state fresh va tat no voi reduced motion.

## Change map

| Area     | Files                                       | Change                                    | Risk                          |
| -------- | ------------------------------------------- | ----------------------------------------- | ----------------------------- |
| Client   | `apps/ops-web/features/incidents`           | contract client + feed state model        | token leak, cursor regression |
| UI       | `apps/ops-web/app/incidents`, `globals.css` | interactive synthetic read-only shell     | fake mistaken as live         |
| Package  | `apps/ops-web/package.json`, Jest config    | contracts dependency + deterministic test | CI/tool drift                 |
| Docs/UAT | plan, README, HANDOFF, UAT                  | T14A boundary/evidence                    | overclaim T14 completion      |

## Implementation sequence

1. Model monotonic resume/dedupe/latest-per-incident and explicit stale/error state.
2. Add fetch adapter that passes bearer without storage/logging and validates the
   exact feed/Problem Details contracts.
3. Add authorization-aware navigation capability model; API remains enforcement.
4. Replace static incident page with keyboard-accessible interactive local fixture,
   manual refresh affordance and explicit synthetic/read-only boundary.
5. Unit tests, build, local browser screenshots/viewports and docs.

## Test plan

- Unit: initial/overlap/dedupe/out-of-order cursor, invalid contract, auth/network,
  stale timestamp, role navigation and immutable input.
- Contract: reuse `OpsIncidentFeedSchema`; no duplicate UI-only DTO.
- E2E/browser: desktop/mobile, keyboard focus, selection/filter, stale/failure copy,
  reduced motion and no console errors.
- Authorization-negative: client never treats hidden navigation as permission;
  401/403 are terminal auth states, no silent empty queue.
- Failure/degraded: manual refresh default, last validated data remains visibly
  stale; invalid response is not merged.

## Rollout and rollback

- Feature flag: no live data flag in T14A; `/incidents` remains explicit synthetic
  local contract shell until D-02 integration is approved.
- No migration/API change. Rollback ops-web assets/client files only.
- Never copy a local mock bearer into browser source, screenshots or logs.

## Definition of done

- [x] Validated read-only feed client and monotonic resume model.
- [x] Overlap dedupes and stale/auth/contract failures are visible.
- [x] Role-aware navigation model has negative tests and security disclaimer.
- [x] Responsive keyboard-accessible synthetic workspace with screenshot evidence.
- [x] Full local gates and browser smoke pass; T14B blockers remain explicit.
- [ ] GitHub CI passes for the published T14A commit.

## Progress log

- [x] 2026-08-19: source/ADR/current-state review and T14A boundary complete.
- [x] T14A implementation and focused browser/unit/build verification.

## Handoff

- Changed files: ops incident model/client/navigation, interactive workspace CSS,
  Jest/browser tests, desktop/mobile evidence and operator docs.
- Tests run/results: 10/10 focused unit; full frozen-install, format/lint/typecheck,
  283 unit tests with coverage, contract/e2e/build and browser desktop/mobile/
  keyboard/reduced-motion smoke pass. GitHub CI pending.
- Remaining risks: no approved login, dispatch/SLA/service area, realtime cadence or
  operator UAT; T14 is not complete.
- Rollback: keep existing static shell or revert ops-web-only changes.
