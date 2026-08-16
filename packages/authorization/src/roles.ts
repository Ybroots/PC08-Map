/**
 * Role definitions - ATGT Platform
 *
 * From Section 5.2 of technical spec.
 * DENY BY DEFAULT: absence of explicit permission = denied.
 * UI hiding is NEVER authorization - all checks happen server-side.
 */
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

export enum DataClass {
  PUBLIC = "public",
  INTERNAL = "internal",
  SENSITIVE = "sensitive",
  RESTRICTED = "restricted",
}

/**
 * AccessScope - The resolved scope passed to every repository method.
 *
 * Every repository query MUST receive a scope; queries without scope are rejected.
 * This prevents accidental full-table access.
 */
export interface AccessScope {
  /** The authenticated principal */
  principalId: string;
  role: OfficerRole | "citizen_guest";
  /** Unit IDs this principal belongs to (for field officers) */
  unitIds?: string[];
  /** Area IDs this principal has jurisdiction over */
  areaIds?: string[];
  /** Specific case IDs this principal is assigned to */
  assignedCaseIds?: string[];
  /** Maximum data class this principal can access */
  maxDataClass: DataClass;
}

/**
 * CitizenSession - Anonymous session for citizen/public access
 * No PII stored; session is rotated periodically.
 */
export interface CitizenSession {
  sessionId: string; // Anonymous session token (not user ID)
  deviceClass: string; // "mobile" | "web" - for rate limiting
  createdAt: string; // UTC ISO8601
}

/**
 * PolicyResult - Result of a policy evaluation
 */
export interface PolicyResult {
  allowed: boolean;
  reason?: string; // Only populated when denied - for logging, not for client
}
