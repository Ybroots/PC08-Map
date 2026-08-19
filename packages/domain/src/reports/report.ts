import { ReportState } from "../incidents/incident-state.enum";

export const REPORT_ACTOR_ROLES = ["SYSTEM", "DISPATCHER"] as const;
export type ReportActorRole = (typeof REPORT_ACTOR_ROLES)[number];

export type PublicReportStatus =
  "RECEIVED" | "IN_PROGRESS" | "COMPLETED" | "INSUFFICIENT_BASIS";

export interface ReportSnapshot {
  state: ReportState;
  version: number;
}

export interface ReportTransition {
  to: ReportState;
  actorRole: ReportActorRole;
  expectedVersion: number;
  reason?: string;
}

export type ReportRuleViolationCode =
  | "INVALID_STATE"
  | "ACTOR_NOT_ALLOWED"
  | "REASON_REQUIRED"
  | "VERSION_CONFLICT";

export class ReportRuleViolation extends Error {
  constructor(readonly code: ReportRuleViolationCode) {
    super(code);
    this.name = "ReportRuleViolation";
  }
}

const NEXT_STATES: Readonly<Record<ReportState, ReadonlySet<ReportState>>> = {
  [ReportState.RECEIVED]: new Set([ReportState.SCREENING]),
  [ReportState.SCREENING]: new Set([ReportState.PENDING_VERIFICATION]),
  [ReportState.PENDING_VERIFICATION]: new Set([
    ReportState.VERIFIED,
    ReportState.REJECTED,
    ReportState.DUPLICATE,
  ]),
  [ReportState.VERIFIED]: new Set([ReportState.IN_PROCESS]),
  [ReportState.IN_PROCESS]: new Set([ReportState.RESOLVED]),
  [ReportState.RESOLVED]: new Set([ReportState.CLOSED]),
  [ReportState.CLOSED]: new Set([ReportState.ARCHIVED]),
  [ReportState.REJECTED]: new Set([ReportState.ARCHIVED]),
  [ReportState.DUPLICATE]: new Set([ReportState.ARCHIVED]),
  [ReportState.ARCHIVED]: new Set(),
};

const REASON_REQUIRED = new Set<ReportState>([
  ReportState.REJECTED,
  ReportState.DUPLICATE,
]);

function actorCanTransition(
  from: ReportState,
  to: ReportState,
  actor: ReportActorRole,
): boolean {
  if (actor === "SYSTEM") {
    return (
      (from === ReportState.RECEIVED && to === ReportState.SCREENING) ||
      (from === ReportState.SCREENING &&
        to === ReportState.PENDING_VERIFICATION) ||
      to === ReportState.ARCHIVED
    );
  }
  return (
    from === ReportState.PENDING_VERIFICATION ||
    from === ReportState.VERIFIED ||
    from === ReportState.IN_PROCESS ||
    from === ReportState.RESOLVED
  );
}

export function transitionReport(
  report: ReportSnapshot,
  transition: ReportTransition,
): ReportSnapshot {
  if (report.version !== transition.expectedVersion) {
    throw new ReportRuleViolation("VERSION_CONFLICT");
  }
  if (!NEXT_STATES[report.state].has(transition.to)) {
    throw new ReportRuleViolation("INVALID_STATE");
  }
  if (!actorCanTransition(report.state, transition.to, transition.actorRole)) {
    throw new ReportRuleViolation("ACTOR_NOT_ALLOWED");
  }
  if (REASON_REQUIRED.has(transition.to) && !transition.reason?.trim()) {
    throw new ReportRuleViolation("REASON_REQUIRED");
  }
  return { state: transition.to, version: report.version + 1 };
}

export function toPublicReportStatus(state: ReportState): PublicReportStatus {
  if (state === ReportState.RECEIVED) return "RECEIVED";
  if (
    state === ReportState.RESOLVED ||
    state === ReportState.CLOSED ||
    state === ReportState.ARCHIVED
  ) {
    return "COMPLETED";
  }
  if (state === ReportState.REJECTED || state === ReportState.DUPLICATE) {
    return "INSUFFICIENT_BASIS";
  }
  return "IN_PROGRESS";
}
