import { IncidentState } from "./incident-state.enum";
import {
  IncidentRuleViolation,
  toPublicIncidentStatus,
  transitionIncident,
} from "./incident";

describe("incident lifecycle", () => {
  it("walks the automated intake states before dispatcher verification", () => {
    const screened = transitionIncident(
      { state: IncidentState.RECEIVED, version: 1 },
      {
        to: IncidentState.AUTO_SCREENING,
        actorRole: "SYSTEM",
        expectedVersion: 1,
      },
    );
    expect(screened).toEqual({
      state: IncidentState.AUTO_SCREENING,
      version: 2,
    });
    expect(
      transitionIncident(screened, {
        to: IncidentState.PENDING_VERIFICATION,
        actorRole: "SYSTEM",
        expectedVersion: 2,
      }),
    ).toEqual({ state: IncidentState.PENDING_VERIFICATION, version: 3 });
  });

  it("denies a direct RECEIVED to CLOSED jump", () => {
    expect(() =>
      transitionIncident(
        { state: IncidentState.RECEIVED, version: 1 },
        {
          to: IncidentState.CLOSED,
          actorRole: "DISPATCHER",
          expectedVersion: 1,
        },
      ),
    ).toThrow(new IncidentRuleViolation("INVALID_STATE"));
  });

  it("enforces actor authority and optimistic version", () => {
    expect(() =>
      transitionIncident(
        { state: IncidentState.PENDING_VERIFICATION, version: 3 },
        {
          to: IncidentState.VERIFIED,
          actorRole: "FIELD_OFFICER",
          expectedVersion: 3,
        },
      ),
    ).toThrow(new IncidentRuleViolation("ACTOR_NOT_ALLOWED"));
    expect(() =>
      transitionIncident(
        { state: IncidentState.PENDING_VERIFICATION, version: 3 },
        {
          to: IncidentState.VERIFIED,
          actorRole: "DISPATCHER",
          expectedVersion: 2,
        },
      ),
    ).toThrow(new IncidentRuleViolation("VERSION_CONFLICT"));
  });

  it("requires a reason for rejection, duplicate and cancellation", () => {
    expect(() =>
      transitionIncident(
        { state: IncidentState.PENDING_VERIFICATION, version: 2 },
        {
          to: IncidentState.REJECTED,
          actorRole: "DISPATCHER",
          expectedVersion: 2,
        },
      ),
    ).toThrow(new IncidentRuleViolation("REASON_REQUIRED"));
    expect(
      transitionIncident(
        { state: IncidentState.PENDING_VERIFICATION, version: 2 },
        {
          to: IncidentState.REJECTED,
          actorRole: "DISPATCHER",
          expectedVersion: 2,
          reason: "Không đủ cơ sở xác minh",
        },
      ).state,
    ).toBe(IncidentState.REJECTED);
  });

  it("projects only approved generalized public statuses", () => {
    expect(toPublicIncidentStatus(IncidentState.RECEIVED)).toBe("RECEIVED");
    expect(toPublicIncidentStatus(IncidentState.ON_SCENE)).toBe("IN_PROGRESS");
    expect(toPublicIncidentStatus(IncidentState.CLOSED)).toBe("COMPLETED");
    expect(toPublicIncidentStatus(IncidentState.DUPLICATE)).toBe(
      "INSUFFICIENT_BASIS",
    );
  });
});
