import {
  AccessScope,
  CITIZEN_GUEST_ROLE,
  DataClass,
  OfficerRole,
  StepUpContext,
} from "./roles";

export enum PolicyAction {
  PUBLIC_SOS_SUBMIT = "public.sos.submit",
  PUBLIC_REPORT_SUBMIT = "public.report.submit",
  PUBLIC_MAP_READ = "public.map.read",
  PUBLIC_TRACK_READ = "public.track.read",
  INCIDENT_READ = "incident.read",
  INCIDENT_ASSIGN = "incident.assign",
  INCIDENT_UPDATE_STATUS = "incident.update_status",
  REPORT_READ = "report.read",
  REPORT_VERIFY = "report.verify",
  EVIDENCE_VIEW = "evidence.view",
  MAP_DRAFT_WRITE = "map.draft.write",
  MAP_PUBLISH = "map.publish",
  ANALYTICS_READ = "analytics.read",
  AUDIT_READ = "audit.read",
  PRIVACY_BREAK_GLASS_APPROVE = "privacy.break_glass.approve",
  SYSTEM_CONFIG_WRITE = "system.config.write",
}

export interface PolicyResource {
  dataClass: DataClass;
  unitId?: string;
  areaId?: string;
  caseId?: string;
}

export interface PolicyRequest {
  action: PolicyAction;
  resource: PolicyResource;
  stepUp?: StepUpContext;
}

export type PolicyDenyReason =
  | "MISSING_PRINCIPAL"
  | "ROLE_NOT_ALLOWED"
  | "DATA_CLASS_EXCEEDED"
  | "AREA_SCOPE_MISMATCH"
  | "UNIT_SCOPE_MISMATCH"
  | "CASE_SCOPE_MISMATCH"
  | "STEP_UP_REQUIRED"
  | "POLICY_DISABLED";

export type PolicyResult =
  { allowed: true } | { allowed: false; reason: PolicyDenyReason };

const DATA_CLASS_RANK: Readonly<Record<DataClass, number>> = {
  [DataClass.PUBLIC]: 0,
  [DataClass.INTERNAL]: 1,
  [DataClass.SENSITIVE]: 2,
  [DataClass.RESTRICTED]: 3,
};

const PUBLIC_ACTIONS = new Set<PolicyAction>([
  PolicyAction.PUBLIC_SOS_SUBMIT,
  PolicyAction.PUBLIC_REPORT_SUBMIT,
  PolicyAction.PUBLIC_MAP_READ,
  PolicyAction.PUBLIC_TRACK_READ,
]);

const ROLE_ACTIONS: Readonly<Record<OfficerRole, ReadonlySet<PolicyAction>>> = {
  [OfficerRole.DISPATCHER]: new Set([
    PolicyAction.INCIDENT_READ,
    PolicyAction.INCIDENT_ASSIGN,
    PolicyAction.INCIDENT_UPDATE_STATUS,
    PolicyAction.EVIDENCE_VIEW,
    PolicyAction.REPORT_READ,
    PolicyAction.REPORT_VERIFY,
  ]),
  [OfficerRole.FIELD_OFFICER]: new Set([
    PolicyAction.INCIDENT_READ,
    PolicyAction.INCIDENT_UPDATE_STATUS,
  ]),
  [OfficerRole.DATA_EDITOR]: new Set([PolicyAction.MAP_DRAFT_WRITE]),
  [OfficerRole.DATA_APPROVER]: new Set([PolicyAction.MAP_PUBLISH]),
  [OfficerRole.LEADER_VIEWER]: new Set([PolicyAction.ANALYTICS_READ]),
  [OfficerRole.SECURITY_AUDITOR]: new Set([PolicyAction.AUDIT_READ]),
  [OfficerRole.PRIVACY_APPROVER]: new Set([
    PolicyAction.PRIVACY_BREAK_GLASS_APPROVE,
  ]),
  [OfficerRole.SYSTEM_ADMIN]: new Set([PolicyAction.SYSTEM_CONFIG_WRITE]),
};

function isInScope(
  value: string | undefined,
  grants: readonly string[],
): boolean {
  return value === undefined || grants.includes(value);
}

function requiresArea(action: PolicyAction, role: OfficerRole): boolean {
  if (role === OfficerRole.DISPATCHER) {
    return (
      action === PolicyAction.INCIDENT_READ ||
      action === PolicyAction.INCIDENT_ASSIGN ||
      action === PolicyAction.INCIDENT_UPDATE_STATUS ||
      action === PolicyAction.REPORT_READ ||
      action === PolicyAction.REPORT_VERIFY
    );
  }
  return (
    action === PolicyAction.MAP_DRAFT_WRITE ||
    action === PolicyAction.MAP_PUBLISH ||
    action === PolicyAction.ANALYTICS_READ
  );
}

function requiresUnit(action: PolicyAction, role: OfficerRole): boolean {
  return (
    role === OfficerRole.FIELD_OFFICER &&
    (action === PolicyAction.INCIDENT_READ ||
      action === PolicyAction.INCIDENT_UPDATE_STATUS)
  );
}

function requiresCase(action: PolicyAction, role: OfficerRole): boolean {
  return (
    role === OfficerRole.FIELD_OFFICER ||
    (role === OfficerRole.DISPATCHER && action === PolicyAction.EVIDENCE_VIEW)
  );
}

/** Pure, deterministic RBAC + ABAC policy evaluator. */
export class AuthorizationPolicy {
  evaluate(
    scope: AccessScope | null | undefined,
    request: PolicyRequest,
  ): PolicyResult {
    if (!scope) return { allowed: false, reason: "MISSING_PRINCIPAL" };

    if (scope.role === CITIZEN_GUEST_ROLE) {
      if (!PUBLIC_ACTIONS.has(request.action)) {
        return { allowed: false, reason: "ROLE_NOT_ALLOWED" };
      }
      return request.resource.dataClass === DataClass.PUBLIC
        ? { allowed: true }
        : { allowed: false, reason: "DATA_CLASS_EXCEEDED" };
    }

    if (!ROLE_ACTIONS[scope.role].has(request.action)) {
      return { allowed: false, reason: "ROLE_NOT_ALLOWED" };
    }
    if (
      DATA_CLASS_RANK[request.resource.dataClass] >
      DATA_CLASS_RANK[scope.maxDataClass]
    ) {
      return { allowed: false, reason: "DATA_CLASS_EXCEEDED" };
    }

    if (request.action === PolicyAction.PRIVACY_BREAK_GLASS_APPROVE) {
      if (!request.stepUp?.mfaSatisfied) {
        return { allowed: false, reason: "STEP_UP_REQUIRED" };
      }
      return { allowed: false, reason: "POLICY_DISABLED" };
    }

    const { areaId, unitId, caseId } = request.resource;
    if (
      (requiresArea(request.action, scope.role) && !areaId) ||
      !isInScope(areaId, scope.areaIds)
    ) {
      return { allowed: false, reason: "AREA_SCOPE_MISMATCH" };
    }
    if (
      (requiresUnit(request.action, scope.role) && !unitId) ||
      !isInScope(unitId, scope.unitIds)
    ) {
      return { allowed: false, reason: "UNIT_SCOPE_MISMATCH" };
    }
    if (
      (requiresCase(request.action, scope.role) && !caseId) ||
      !isInScope(caseId, scope.assignedCaseIds)
    ) {
      return { allowed: false, reason: "CASE_SCOPE_MISMATCH" };
    }

    return { allowed: true };
  }
}
