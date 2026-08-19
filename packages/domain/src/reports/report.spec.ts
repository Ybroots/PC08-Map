import { ReportState } from "../incidents/incident-state.enum";
import {
  ReportRuleViolation,
  toPublicReportStatus,
  transitionReport,
} from "./report";

describe("report lifecycle", () => {
  it("requires system screening before operator verification", () => {
    expect(
      transitionReport(
        { state: ReportState.RECEIVED, version: 1 },
        {
          to: ReportState.SCREENING,
          actorRole: "SYSTEM",
          expectedVersion: 1,
        },
      ),
    ).toEqual({ state: ReportState.SCREENING, version: 2 });
    expect(() =>
      transitionReport(
        { state: ReportState.RECEIVED, version: 1 },
        {
          to: ReportState.VERIFIED,
          actorRole: "DISPATCHER",
          expectedVersion: 1,
        },
      ),
    ).toThrow(new ReportRuleViolation("INVALID_STATE"));
  });

  it("never lets the system conclude rejected, duplicate or verified", () => {
    for (const to of [
      ReportState.VERIFIED,
      ReportState.REJECTED,
      ReportState.DUPLICATE,
    ]) {
      expect(() =>
        transitionReport(
          { state: ReportState.PENDING_VERIFICATION, version: 3 },
          {
            to,
            actorRole: "SYSTEM",
            expectedVersion: 3,
            reason: "synthetic reason",
          },
        ),
      ).toThrow(new ReportRuleViolation("ACTOR_NOT_ALLOWED"));
    }
  });

  it("does not let an operator bypass system screening", () => {
    expect(() =>
      transitionReport(
        { state: ReportState.SCREENING, version: 2 },
        {
          to: ReportState.PENDING_VERIFICATION,
          actorRole: "DISPATCHER",
          expectedVersion: 2,
        },
      ),
    ).toThrow(new ReportRuleViolation("ACTOR_NOT_ALLOWED"));
  });

  it("requires a reason for operator rejection or duplicate conclusion", () => {
    for (const to of [ReportState.REJECTED, ReportState.DUPLICATE]) {
      expect(() =>
        transitionReport(
          { state: ReportState.PENDING_VERIFICATION, version: 3 },
          { to, actorRole: "DISPATCHER", expectedVersion: 3 },
        ),
      ).toThrow(new ReportRuleViolation("REASON_REQUIRED"));
    }
  });

  it("rejects optimistic version conflicts", () => {
    expect(() =>
      transitionReport(
        { state: ReportState.RECEIVED, version: 2 },
        {
          to: ReportState.SCREENING,
          actorRole: "SYSTEM",
          expectedVersion: 1,
        },
      ),
    ).toThrow(new ReportRuleViolation("VERSION_CONFLICT"));
  });

  it.each([
    [ReportState.RECEIVED, "RECEIVED"],
    [ReportState.SCREENING, "IN_PROGRESS"],
    [ReportState.PENDING_VERIFICATION, "IN_PROGRESS"],
    [ReportState.VERIFIED, "IN_PROGRESS"],
    [ReportState.IN_PROCESS, "IN_PROGRESS"],
    [ReportState.RESOLVED, "COMPLETED"],
    [ReportState.CLOSED, "COMPLETED"],
    [ReportState.ARCHIVED, "COMPLETED"],
    [ReportState.REJECTED, "INSUFFICIENT_BASIS"],
    [ReportState.DUPLICATE, "INSUFFICIENT_BASIS"],
  ] as const)("maps %s to generalized public status", (state, expected) => {
    expect(toPublicReportStatus(state)).toBe(expected);
  });
});
