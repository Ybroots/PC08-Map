import type { AccessScope } from "@atgt/authorization";

export const IDENTITY_PROVIDER = Symbol("IDENTITY_PROVIDER");
export const SESSION_REVOCATION_STORE = Symbol("SESSION_REVOCATION_STORE");
export const CITIZEN_SESSION_STORE = Symbol("CITIZEN_SESSION_STORE");
export const SECURITY_AUDIT_SINK = Symbol("SECURITY_AUDIT_SINK");
export const RUNTIME_CONFIG = Symbol("RUNTIME_CONFIG");

export type AuthenticationFailureCode = "INVALID_TOKEN" | "SESSION_REVOKED";

export class AuthenticationFailure extends Error {
  constructor(readonly code: AuthenticationFailureCode) {
    super(code);
    this.name = "AuthenticationFailure";
  }
}

export interface IdentityProviderPort {
  authenticate(token: string): Promise<AccessScope>;
}

export interface SessionRevocationStore {
  isRevoked(sessionId: string): Promise<boolean>;
}

export type SecurityAuditOutcome = "SUCCESS" | "DENIED" | "ERROR";

export interface SecurityAuditEvent {
  category: "AUTHENTICATION" | "AUTHORIZATION";
  principalId: string;
  action: string;
  outcome: SecurityAuditOutcome;
  reason?: string;
  traceId: string;
  resourceType: string;
  resourceId: string;
  scope?: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface SecurityAuditSink {
  record(event: SecurityAuditEvent): Promise<void>;
}
