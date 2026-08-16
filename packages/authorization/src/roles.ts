/** Officer roles defined by the approved access-control draft. */
export enum OfficerRole {
  DISPATCHER = "dispatcher",
  FIELD_OFFICER = "field_officer",
  DATA_EDITOR = "data_editor",
  DATA_APPROVER = "data_approver",
  LEADER_VIEWER = "leader_viewer",
  SECURITY_AUDITOR = "security_auditor",
  PRIVACY_APPROVER = "privacy_approver",
  SYSTEM_ADMIN = "system_admin",
}

export const CITIZEN_GUEST_ROLE = "citizen_guest" as const;
export type PrincipalRole = OfficerRole | typeof CITIZEN_GUEST_ROLE;

export enum DataClass {
  PUBLIC = "public",
  INTERNAL = "internal",
  SENSITIVE = "sensitive",
  RESTRICTED = "restricted",
}

export interface AccessScopeInput {
  principalId: string;
  role: PrincipalRole;
  unitIds?: readonly string[];
  areaIds?: readonly string[];
  assignedCaseIds?: readonly string[];
  maxDataClass: DataClass;
  sessionId?: string;
  authenticationMethods?: readonly string[];
}

const resolvedScope: unique symbol = Symbol("atgt.resolved-access-scope");

/**
 * Scope accepted by application services and repositories.
 *
 * The brand can only be created through `createAccessScope`, preventing a
 * repository caller from accidentally passing an unvalidated claims object.
 */
export type AccessScope = Readonly<{
  principalId: string;
  role: PrincipalRole;
  unitIds: readonly string[];
  areaIds: readonly string[];
  assignedCaseIds: readonly string[];
  maxDataClass: DataClass;
  sessionId?: string;
  authenticationMethods: readonly string[];
  [resolvedScope]: true;
}>;

function normalizeIdentifiers(
  identifiers: readonly string[] | undefined,
): readonly string[] {
  return Object.freeze(
    [...new Set(identifiers ?? [])]
      .map((identifier) => identifier.trim())
      .filter(Boolean)
      .sort(),
  );
}

export function createAccessScope(input: AccessScopeInput): AccessScope {
  const principalId = input.principalId.trim();
  if (!principalId) throw new Error("principalId is required");

  return Object.freeze({
    principalId,
    role: input.role,
    unitIds: normalizeIdentifiers(input.unitIds),
    areaIds: normalizeIdentifiers(input.areaIds),
    assignedCaseIds: normalizeIdentifiers(input.assignedCaseIds),
    maxDataClass: input.maxDataClass,
    sessionId: input.sessionId?.trim() || undefined,
    authenticationMethods: normalizeIdentifiers(input.authenticationMethods),
    [resolvedScope]: true as const,
  });
}

export function requireAccessScope(
  scope: AccessScope | null | undefined,
): AccessScope {
  if (!scope || scope[resolvedScope] !== true) {
    throw new Error("A resolved access scope is required");
  }
  return scope;
}

export interface CitizenSession {
  sessionId: string;
  deviceClass: "mobile" | "web";
  createdAt: string;
  expiresAt: string;
}

export interface StepUpContext {
  mfaSatisfied: boolean;
  authenticationMethods: readonly string[];
  approvedGrantId?: string;
}
