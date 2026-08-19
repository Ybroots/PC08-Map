import { AuthorizationPolicy, PolicyAction, PolicyRequest } from "./policy";
import {
  AccessScope,
  CITIZEN_GUEST_ROLE,
  createAccessScope,
  DataClass,
  OfficerRole,
  requireAccessScope,
} from "./roles";

const AREA_A = "area-a";
const AREA_B = "area-b";
const UNIT_A = "unit-a";
const UNIT_B = "unit-b";
const CASE_A = "case-a";
const CASE_B = "case-b";

function scope(
  role: OfficerRole,
  maxDataClass: DataClass = DataClass.SENSITIVE,
): AccessScope {
  return createAccessScope({
    principalId: `principal-${role}`,
    role,
    areaIds: [AREA_A],
    unitIds: [UNIT_A],
    assignedCaseIds: [CASE_A],
    maxDataClass,
    authenticationMethods: ["pwd", "mfa"],
  });
}

function request(
  action: PolicyAction,
  resource: Partial<PolicyRequest["resource"]> = {},
): PolicyRequest {
  return {
    action,
    resource: { dataClass: DataClass.INTERNAL, ...resource },
  };
}

describe("AuthorizationPolicy traceability matrix", () => {
  const policy = new AuthorizationPolicy();

  it.each([
    [
      "dispatcher can read an incident in its area",
      OfficerRole.DISPATCHER,
      request(PolicyAction.INCIDENT_READ, { areaId: AREA_A }),
    ],
    [
      "dispatcher can verify an incident in its area",
      OfficerRole.DISPATCHER,
      request(PolicyAction.INCIDENT_UPDATE_STATUS, { areaId: AREA_A }),
    ],
    [
      "dispatcher can read a citizen report verification queue in its area",
      OfficerRole.DISPATCHER,
      request(PolicyAction.REPORT_READ, { areaId: AREA_A }),
    ],
    [
      "dispatcher can decide a citizen report in its area",
      OfficerRole.DISPATCHER,
      request(PolicyAction.REPORT_VERIFY, { areaId: AREA_A }),
    ],
    [
      "dispatcher can view evidence in its area and assigned case",
      OfficerRole.DISPATCHER,
      request(PolicyAction.EVIDENCE_VIEW, {
        areaId: AREA_A,
        caseId: CASE_A,
        dataClass: DataClass.SENSITIVE,
      }),
    ],
    [
      "field officer can update an assigned case for its unit",
      OfficerRole.FIELD_OFFICER,
      request(PolicyAction.INCIDENT_UPDATE_STATUS, {
        unitId: UNIT_A,
        caseId: CASE_A,
      }),
    ],
    [
      "data editor can write a draft in its area",
      OfficerRole.DATA_EDITOR,
      request(PolicyAction.MAP_DRAFT_WRITE, { areaId: AREA_A }),
    ],
    [
      "data approver can publish in its area",
      OfficerRole.DATA_APPROVER,
      request(PolicyAction.MAP_PUBLISH, { areaId: AREA_A }),
    ],
    [
      "leader can read scoped analytics",
      OfficerRole.LEADER_VIEWER,
      request(PolicyAction.ANALYTICS_READ, { areaId: AREA_A }),
    ],
    [
      "security auditor can read audit records",
      OfficerRole.SECURITY_AUDITOR,
      request(PolicyAction.AUDIT_READ),
    ],
    [
      "system admin can change system configuration",
      OfficerRole.SYSTEM_ADMIN,
      request(PolicyAction.SYSTEM_CONFIG_WRITE),
    ],
  ])("allows: %s", (_description, role, policyRequest) => {
    expect(policy.evaluate(scope(role), policyRequest)).toEqual({
      allowed: true,
    });
  });

  it.each([
    [
      "missing principal",
      undefined,
      request(PolicyAction.AUDIT_READ),
      "MISSING_PRINCIPAL",
    ],
    [
      "dispatcher crossing area",
      scope(OfficerRole.DISPATCHER),
      request(PolicyAction.INCIDENT_READ, { areaId: AREA_B }),
      "AREA_SCOPE_MISMATCH",
    ],
    [
      "dispatcher verifying a report across areas",
      scope(OfficerRole.DISPATCHER),
      request(PolicyAction.REPORT_VERIFY, { areaId: AREA_B }),
      "AREA_SCOPE_MISMATCH",
    ],
    [
      "field officer deciding a citizen report",
      scope(OfficerRole.FIELD_OFFICER),
      request(PolicyAction.REPORT_VERIFY, { areaId: AREA_A }),
      "ROLE_NOT_ALLOWED",
    ],
    [
      "field officer crossing unit",
      scope(OfficerRole.FIELD_OFFICER),
      request(PolicyAction.INCIDENT_UPDATE_STATUS, {
        unitId: UNIT_B,
        caseId: CASE_A,
      }),
      "UNIT_SCOPE_MISMATCH",
    ],
    [
      "field officer crossing case assignment",
      scope(OfficerRole.FIELD_OFFICER),
      request(PolicyAction.INCIDENT_UPDATE_STATUS, {
        unitId: UNIT_A,
        caseId: CASE_B,
      }),
      "CASE_SCOPE_MISMATCH",
    ],
    [
      "dispatcher viewing unassigned evidence",
      scope(OfficerRole.DISPATCHER),
      request(PolicyAction.EVIDENCE_VIEW, { caseId: CASE_B }),
      "CASE_SCOPE_MISMATCH",
    ],
    [
      "data editor approving its own class of change",
      scope(OfficerRole.DATA_EDITOR),
      request(PolicyAction.MAP_PUBLISH, { areaId: AREA_A }),
      "ROLE_NOT_ALLOWED",
    ],
    [
      "system admin reading evidence",
      scope(OfficerRole.SYSTEM_ADMIN),
      request(PolicyAction.EVIDENCE_VIEW, { caseId: CASE_A }),
      "ROLE_NOT_ALLOWED",
    ],
    [
      "principal exceeding data classification",
      scope(OfficerRole.DISPATCHER, DataClass.INTERNAL),
      request(PolicyAction.INCIDENT_READ, {
        areaId: AREA_A,
        dataClass: DataClass.SENSITIVE,
      }),
      "DATA_CLASS_EXCEEDED",
    ],
  ] satisfies readonly [
    string,
    AccessScope | undefined,
    PolicyRequest,
    string,
  ][])("denies: %s", (_description, accessScope, policyRequest, reason) => {
    expect(policy.evaluate(accessScope, policyRequest)).toEqual({
      allowed: false,
      reason,
    });
  });

  it("keeps break-glass disabled even with an MFA claim", () => {
    expect(
      policy.evaluate(
        scope(OfficerRole.PRIVACY_APPROVER, DataClass.RESTRICTED),
        {
          ...request(PolicyAction.PRIVACY_BREAK_GLASS_APPROVE, {
            dataClass: DataClass.RESTRICTED,
          }),
          stepUp: {
            mfaSatisfied: true,
            authenticationMethods: ["pwd", "mfa"],
            approvedGrantId: "grant-pending-policy",
          },
        },
      ),
    ).toEqual({ allowed: false, reason: "POLICY_DISABLED" });
  });

  it("requires step-up before evaluating break-glass policy status", () => {
    expect(
      policy.evaluate(
        scope(OfficerRole.PRIVACY_APPROVER, DataClass.RESTRICTED),
        request(PolicyAction.PRIVACY_BREAK_GLASS_APPROVE, {
          dataClass: DataClass.RESTRICTED,
        }),
      ),
    ).toEqual({ allowed: false, reason: "STEP_UP_REQUIRED" });
  });

  it("allows a citizen only public actions over public data", () => {
    const citizen = createAccessScope({
      principalId: "citizen-session",
      role: CITIZEN_GUEST_ROLE,
      maxDataClass: DataClass.PUBLIC,
    });
    expect(
      policy.evaluate(
        citizen,
        request(PolicyAction.PUBLIC_MAP_READ, {
          dataClass: DataClass.PUBLIC,
        }),
      ),
    ).toEqual({ allowed: true });
    expect(
      policy.evaluate(citizen, request(PolicyAction.INCIDENT_READ)),
    ).toEqual({ allowed: false, reason: "ROLE_NOT_ALLOWED" });
  });
});

describe("resolved repository access scope", () => {
  it("normalizes and freezes grants", () => {
    const resolved = createAccessScope({
      principalId: " officer-1 ",
      role: OfficerRole.DISPATCHER,
      unitIds: [UNIT_A, UNIT_A, ""],
      maxDataClass: DataClass.INTERNAL,
    });

    expect(resolved.principalId).toBe("officer-1");
    expect(resolved.unitIds).toEqual([UNIT_A]);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(requireAccessScope(resolved)).toBe(resolved);
  });

  it("rejects a structurally forged scope", () => {
    expect(() => requireAccessScope({} as AccessScope)).toThrow(
      "A resolved access scope is required",
    );
  });
});
