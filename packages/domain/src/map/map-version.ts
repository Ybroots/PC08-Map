export const MAP_VERSION_STATES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "EXPIRED",
  "WITHDRAWN",
  "ARCHIVED",
] as const;

export type MapVersionState = (typeof MAP_VERSION_STATES)[number];

export class MapVersionRuleViolation extends Error {
  constructor(
    readonly code: "INVALID_STATE" | "MAKER_CHECKER" | "INVALID_CLOCK",
  ) {
    super(code);
    this.name = "MapVersionRuleViolation";
  }
}

export interface MapVersionSnapshot {
  state: MapVersionState;
  createdBy: string;
  submittedBy?: string;
  validFrom: Date;
  validTo?: Date;
}

export function assertValidMapVersionClock(
  validFrom: Date,
  validTo?: Date,
): void {
  if (validTo && validTo.getTime() <= validFrom.getTime()) {
    throw new MapVersionRuleViolation("INVALID_CLOCK");
  }
}

export function submitMapVersion(
  version: MapVersionSnapshot,
  actorRef: string,
): MapVersionSnapshot {
  if (version.state !== "DRAFT") {
    throw new MapVersionRuleViolation("INVALID_STATE");
  }
  return { ...version, state: "IN_REVIEW", submittedBy: actorRef };
}

export function approveMapVersion(
  version: MapVersionSnapshot,
  actorRef: string,
): MapVersionSnapshot {
  if (version.state !== "IN_REVIEW") {
    throw new MapVersionRuleViolation("INVALID_STATE");
  }
  if (!version.submittedBy || version.submittedBy === actorRef) {
    throw new MapVersionRuleViolation("MAKER_CHECKER");
  }
  return { ...version, state: "APPROVED" };
}

export function publishMapVersion(
  version: MapVersionSnapshot,
  now: Date,
): MapVersionSnapshot {
  if (
    version.state !== "APPROVED" ||
    version.validFrom.getTime() > now.getTime()
  ) {
    throw new MapVersionRuleViolation("INVALID_STATE");
  }
  if (version.validTo && version.validTo.getTime() <= now.getTime()) {
    throw new MapVersionRuleViolation("INVALID_CLOCK");
  }
  return { ...version, state: "PUBLISHED" };
}

export function expireMapVersion(
  version: MapVersionSnapshot,
  now: Date,
): MapVersionSnapshot {
  if (
    version.state !== "PUBLISHED" ||
    !version.validTo ||
    version.validTo.getTime() > now.getTime()
  ) {
    throw new MapVersionRuleViolation("INVALID_STATE");
  }
  return { ...version, state: "EXPIRED" };
}

export function withdrawMapVersion(
  version: MapVersionSnapshot,
): MapVersionSnapshot {
  if (version.state !== "PUBLISHED") {
    throw new MapVersionRuleViolation("INVALID_STATE");
  }
  return { ...version, state: "WITHDRAWN" };
}

export function archiveMapVersion(
  version: MapVersionSnapshot,
): MapVersionSnapshot {
  if (version.state !== "EXPIRED" && version.state !== "WITHDRAWN") {
    throw new MapVersionRuleViolation("INVALID_STATE");
  }
  return { ...version, state: "ARCHIVED" };
}
