import { IncidentState } from "./incident-state.enum";

export const INCIDENT_ACTOR_ROLES = [
  "SYSTEM",
  "DISPATCHER",
  "FIELD_OFFICER",
] as const;
export type IncidentActorRole = (typeof INCIDENT_ACTOR_ROLES)[number];

export type PublicIncidentStatus =
  "RECEIVED" | "IN_PROGRESS" | "COMPLETED" | "INSUFFICIENT_BASIS";

export interface IncidentSnapshot {
  state: IncidentState;
  version: number;
}

export interface IncidentTransition {
  to: IncidentState;
  actorRole: IncidentActorRole;
  expectedVersion: number;
  reason?: string;
}

export type IncidentRuleViolationCode =
  | "INVALID_STATE"
  | "ACTOR_NOT_ALLOWED"
  | "REASON_REQUIRED"
  | "VERSION_CONFLICT";

export class IncidentRuleViolation extends Error {
  constructor(readonly code: IncidentRuleViolationCode) {
    super(code);
    this.name = "IncidentRuleViolation";
  }
}

const NEXT_STATES: Readonly<Record<IncidentState, ReadonlySet<IncidentState>>> =
  {
    [IncidentState.RECEIVED]: new Set([IncidentState.AUTO_SCREENING]),
    [IncidentState.AUTO_SCREENING]: new Set([
      IncidentState.PENDING_VERIFICATION,
    ]),
    [IncidentState.PENDING_VERIFICATION]: new Set([
      IncidentState.VERIFIED,
      IncidentState.REJECTED,
      IncidentState.DUPLICATE,
    ]),
    [IncidentState.VERIFIED]: new Set([IncidentState.ASSIGNED]),
    [IncidentState.ASSIGNED]: new Set([
      IncidentState.ACKNOWLEDGED,
      IncidentState.ESCALATED,
      IncidentState.REASSIGNED,
    ]),
    [IncidentState.REASSIGNED]: new Set([
      IncidentState.ACKNOWLEDGED,
      IncidentState.ESCALATED,
    ]),
    [IncidentState.ESCALATED]: new Set([IncidentState.REASSIGNED]),
    [IncidentState.ACKNOWLEDGED]: new Set([IncidentState.EN_ROUTE]),
    [IncidentState.EN_ROUTE]: new Set([IncidentState.ON_SCENE]),
    [IncidentState.ON_SCENE]: new Set([IncidentState.RESOLVED]),
    [IncidentState.RESOLVED]: new Set([IncidentState.CLOSED]),
    [IncidentState.CLOSED]: new Set(),
    [IncidentState.REJECTED]: new Set(),
    [IncidentState.DUPLICATE]: new Set(),
    [IncidentState.CANCELLED]: new Set(),
  };

const CANCELLABLE = new Set<IncidentState>([
  IncidentState.RECEIVED,
  IncidentState.AUTO_SCREENING,
  IncidentState.PENDING_VERIFICATION,
  IncidentState.VERIFIED,
  IncidentState.ASSIGNED,
  IncidentState.REASSIGNED,
  IncidentState.ESCALATED,
  IncidentState.ACKNOWLEDGED,
  IncidentState.EN_ROUTE,
  IncidentState.ON_SCENE,
]);

const REASON_REQUIRED = new Set<IncidentState>([
  IncidentState.REJECTED,
  IncidentState.DUPLICATE,
  IncidentState.CANCELLED,
  IncidentState.ESCALATED,
  IncidentState.REASSIGNED,
]);

function actorCanTransition(
  from: IncidentState,
  to: IncidentState,
  actor: IncidentActorRole,
): boolean {
  if (actor === "SYSTEM") {
    return (
      (from === IncidentState.RECEIVED &&
        to === IncidentState.AUTO_SCREENING) ||
      (from === IncidentState.AUTO_SCREENING &&
        to === IncidentState.PENDING_VERIFICATION)
    );
  }
  if (actor === "DISPATCHER") {
    return (
      from === IncidentState.PENDING_VERIFICATION ||
      from === IncidentState.VERIFIED ||
      from === IncidentState.ASSIGNED ||
      from === IncidentState.REASSIGNED ||
      from === IncidentState.ESCALATED ||
      to === IncidentState.CANCELLED
    );
  }
  return (
    from === IncidentState.ASSIGNED ||
    from === IncidentState.REASSIGNED ||
    from === IncidentState.ACKNOWLEDGED ||
    from === IncidentState.EN_ROUTE ||
    from === IncidentState.ON_SCENE ||
    from === IncidentState.RESOLVED ||
    to === IncidentState.CANCELLED
  );
}

export function transitionIncident(
  incident: IncidentSnapshot,
  transition: IncidentTransition,
): IncidentSnapshot {
  if (incident.version !== transition.expectedVersion) {
    throw new IncidentRuleViolation("VERSION_CONFLICT");
  }
  const normalTransition = NEXT_STATES[incident.state].has(transition.to);
  const cancellation =
    transition.to === IncidentState.CANCELLED &&
    CANCELLABLE.has(incident.state);
  if (!normalTransition && !cancellation) {
    throw new IncidentRuleViolation("INVALID_STATE");
  }
  if (
    !actorCanTransition(incident.state, transition.to, transition.actorRole)
  ) {
    throw new IncidentRuleViolation("ACTOR_NOT_ALLOWED");
  }
  if (REASON_REQUIRED.has(transition.to) && !transition.reason?.trim()) {
    throw new IncidentRuleViolation("REASON_REQUIRED");
  }
  return { state: transition.to, version: incident.version + 1 };
}

export function toPublicIncidentStatus(
  state: IncidentState,
): PublicIncidentStatus {
  if (state === IncidentState.RECEIVED) return "RECEIVED";
  if (state === IncidentState.RESOLVED || state === IncidentState.CLOSED) {
    return "COMPLETED";
  }
  if (
    state === IncidentState.REJECTED ||
    state === IncidentState.DUPLICATE ||
    state === IncidentState.CANCELLED
  ) {
    return "INSUFFICIENT_BASIS";
  }
  return "IN_PROGRESS";
}
