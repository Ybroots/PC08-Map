import {
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  AuthorizationPolicy,
  type AccessScope,
  type PolicyResource,
} from "@atgt/authorization";
import { ERROR_CODES } from "@atgt/contracts";
import { createTraceId, requestContext } from "@atgt/observability";
import type { Request } from "express";
import { SafeHttpException } from "../../platform/safe-http.exception";
import {
  POLICY_METADATA,
  PUBLIC_ROUTE_METADATA,
  type RequiredPolicyMetadata,
} from "./authorization.decorators";
import {
  AuthenticationFailure,
  IDENTITY_PROVIDER,
  SECURITY_AUDIT_SINK,
  type IdentityProviderPort,
  type SecurityAuditSink,
} from "./identity.types";

export interface AuthorizedRequest extends Request {
  accessScope?: AccessScope;
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.header("authorization");
  if (!authorization) return undefined;
  const parts = authorization.split(" ");
  return parts.length === 2 && parts[0] === "Bearer" && parts[1]
    ? parts[1]
    : undefined;
}

function resourceFromRequest(
  request: Request,
  metadata: RequiredPolicyMetadata,
): PolicyResource {
  return {
    dataClass: metadata.dataClass,
    areaId: metadata.areaParam ? request.params[metadata.areaParam] : undefined,
    unitId: metadata.unitParam ? request.params[metadata.unitParam] : undefined,
    caseId: metadata.caseParam ? request.params[metadata.caseParam] : undefined,
  };
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policy: AuthorizationPolicy,
    @Inject(IDENTITY_PROVIDER)
    private readonly identityProvider: IdentityProviderPort,
    @Inject(SECURITY_AUDIT_SINK)
    private readonly audit: SecurityAuditSink,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_METADATA,
      targets,
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const traceId = requestContext.current()?.traceId ?? createTraceId();
    const routeId = `${context.getClass().name}.${context.getHandler().name}`;
    const metadata = this.reflector.getAllAndOverride<RequiredPolicyMetadata>(
      POLICY_METADATA,
      targets,
    );
    if (!metadata) {
      await this.audit.record({
        category: "AUTHORIZATION",
        principalId: "anonymous",
        action: "missing_policy",
        outcome: "DENIED",
        reason: "AUTH_POLICY_MISSING",
        traceId,
        resourceType: "route",
        resourceId: routeId,
      });
      throw new SafeHttpException(
        403,
        ERROR_CODES.AUTH_POLICY_MISSING,
        "Policy missing",
        "The route has no authorization policy",
      );
    }

    const token = bearerToken(request);
    if (!token) {
      await this.recordAuthenticationDenied(traceId, "TOKEN_MISSING");
      throw new SafeHttpException(
        401,
        ERROR_CODES.UNAUTHORIZED,
        "Unauthorized",
        "Authentication is required",
      );
    }

    let scope: AccessScope;
    try {
      scope = await this.identityProvider.authenticate(token);
    } catch (error) {
      const revoked =
        error instanceof AuthenticationFailure &&
        error.code === "SESSION_REVOKED";
      await this.recordAuthenticationDenied(
        traceId,
        revoked ? "SESSION_REVOKED" : "TOKEN_INVALID",
      );
      throw new SafeHttpException(
        401,
        revoked
          ? ERROR_CODES.AUTH_SESSION_REVOKED
          : ERROR_CODES.AUTH_TOKEN_INVALID,
        "Unauthorized",
        revoked
          ? "The authenticated session was revoked"
          : "The token is invalid",
      );
    }

    const resource = resourceFromRequest(request, metadata);
    const result = this.policy.evaluate(scope, {
      action: metadata.action,
      resource,
      stepUp: {
        mfaSatisfied: scope.authenticationMethods.includes("mfa"),
        authenticationMethods: scope.authenticationMethods,
      },
    });
    await this.audit.record({
      category: "AUTHORIZATION",
      principalId: scope.principalId,
      action: metadata.action,
      outcome: result.allowed ? "SUCCESS" : "DENIED",
      reason: result.allowed ? undefined : result.reason,
      traceId,
      resourceType: "route",
      resourceId:
        resource.caseId ?? resource.areaId ?? resource.unitId ?? routeId,
      scope: resource.areaId ?? resource.unitId,
      metadata: { role: scope.role },
    });
    if (!result.allowed) throw new ForbiddenException("Access denied");

    request.accessScope = scope;
    return true;
  }

  private async recordAuthenticationDenied(
    traceId: string,
    reason: string,
  ): Promise<void> {
    await this.audit.record({
      category: "AUTHENTICATION",
      principalId: "anonymous",
      action: "bearer",
      outcome: "DENIED",
      reason,
      traceId,
      resourceType: "session",
      resourceId: "unknown",
    });
  }
}
