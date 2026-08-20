import "reflect-metadata";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  AuthorizationPolicy,
  createAccessScope,
  DataClass,
  OfficerRole,
  PolicyAction,
} from "@atgt/authorization";
import type { Request } from "express";
import { SafeHttpException } from "../../platform/safe-http.exception";
import {
  POLICY_METADATA,
  PUBLIC_ROUTE_METADATA,
  type RequiredPolicyMetadata,
} from "./authorization.decorators";
import {
  AuthorizationGuard,
  type AuthorizedRequest,
} from "./authorization.guard";
import type { IdentityProviderPort } from "./identity.types";
import { InMemorySecurityAuditSink } from "./security-audit.sink";

const dispatcherScope = createAccessScope({
  principalId: "dispatcher-1",
  role: OfficerRole.DISPATCHER,
  areaIds: ["area-a"],
  assignedCaseIds: ["00000000-0000-4000-8000-000000000301"],
  maxDataClass: DataClass.SENSITIVE,
  sessionId: "session-1",
  authenticationMethods: ["pwd", "mfa"],
});

function executionContext(
  handler: () => void,
  request: AuthorizedRequest,
): ExecutionContext {
  class TestController {}
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: <T = Request>() => request as T,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function request(token = "test-token", area = "area-a"): AuthorizedRequest {
  return {
    path: `/internal/areas/${area}/incidents`,
    params: { areaId: area },
    header: (name: string) =>
      name.toLowerCase() === "authorization" ? `Bearer ${token}` : undefined,
  } as unknown as AuthorizedRequest;
}

function policyMetadata(handler: () => void): void {
  const metadata: RequiredPolicyMetadata = {
    action: PolicyAction.INCIDENT_READ,
    dataClass: DataClass.INTERNAL,
    areaParam: "areaId",
  };
  Reflect.defineMetadata(POLICY_METADATA, metadata, handler);
}

describe("AuthorizationGuard", () => {
  it("denies and audits a route with no explicit policy", async () => {
    const audit = new InMemorySecurityAuditSink();
    const provider: IdentityProviderPort = {
      authenticate: jest.fn().mockResolvedValue(dispatcherScope),
    };
    const guard = new AuthorizationGuard(
      new Reflector(),
      new AuthorizationPolicy(),
      provider,
      audit,
    );

    const error = await guard
      .canActivate(executionContext(() => undefined, request()))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SafeHttpException);
    expect(error).toMatchObject({ errorCode: "ATGT_AUTH_POLICY_MISSING" });
    expect(audit.events[0]).toMatchObject({
      outcome: "DENIED",
      reason: "AUTH_POLICY_MISSING",
    });
  });

  it("allows only an explicitly public route without authentication", async () => {
    const handler = () => undefined;
    Reflect.defineMetadata(PUBLIC_ROUTE_METADATA, true, handler);
    const audit = new InMemorySecurityAuditSink();
    const provider: IdentityProviderPort = {
      authenticate: jest.fn(),
    };
    const guard = new AuthorizationGuard(
      new Reflector(),
      new AuthorizationPolicy(),
      provider,
      audit,
    );

    await expect(
      guard.canActivate(executionContext(handler, request(""))),
    ).resolves.toBe(true);
    expect(provider.authenticate).not.toHaveBeenCalled();
    expect(audit.events).toHaveLength(0);
  });

  it("does not put an invalid bearer token in audit data", async () => {
    const handler = () => undefined;
    policyMetadata(handler);
    const audit = new InMemorySecurityAuditSink();
    const provider: IdentityProviderPort = {
      authenticate: jest.fn().mockRejectedValue(new Error("invalid")),
    };
    const guard = new AuthorizationGuard(
      new Reflector(),
      new AuthorizationPolicy(),
      provider,
      audit,
    );
    const secretToken = "secret-token-that-must-not-be-audited";

    await expect(
      guard.canActivate(executionContext(handler, request(secretToken))),
    ).rejects.toBeInstanceOf(SafeHttpException);
    expect(JSON.stringify(audit.events)).not.toContain(secretToken);
  });

  it("denies a valid principal crossing its area", async () => {
    const handler = () => undefined;
    policyMetadata(handler);
    const audit = new InMemorySecurityAuditSink();
    const guard = new AuthorizationGuard(
      new Reflector(),
      new AuthorizationPolicy(),
      { authenticate: async () => dispatcherScope },
      audit,
    );

    await expect(
      guard.canActivate(
        executionContext(handler, request("test-token", "area-b")),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.events.at(-1)).toMatchObject({
      outcome: "DENIED",
      reason: "AREA_SCOPE_MISMATCH",
    });
  });

  it("fails closed when Express supplies a repeated area route parameter", async () => {
    const handler = () => undefined;
    policyMetadata(handler);
    const audit = new InMemorySecurityAuditSink();
    const guard = new AuthorizationGuard(
      new Reflector(),
      new AuthorizationPolicy(),
      { authenticate: async () => dispatcherScope },
      audit,
    );
    const httpRequest = request();
    httpRequest.params = { areaId: ["area-a", "area-b"] };

    await expect(
      guard.canActivate(executionContext(handler, httpRequest)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.events.at(-1)).toMatchObject({
      outcome: "DENIED",
      reason: "AREA_SCOPE_MISMATCH",
    });
  });

  it("attaches a resolved scope only after authentication and policy success", async () => {
    const handler = () => undefined;
    policyMetadata(handler);
    const audit = new InMemorySecurityAuditSink();
    const guard = new AuthorizationGuard(
      new Reflector(),
      new AuthorizationPolicy(),
      { authenticate: async () => dispatcherScope },
      audit,
    );
    const httpRequest = request();

    await expect(
      guard.canActivate(executionContext(handler, httpRequest)),
    ).resolves.toBe(true);
    expect(httpRequest.accessScope).toBe(dispatcherScope);
    expect(audit.events.at(-1)).toMatchObject({ outcome: "SUCCESS" });
  });

  it("denies and audits an evidence URL attempt outside the assigned case", async () => {
    const handler = () => undefined;
    Reflect.defineMetadata(
      POLICY_METADATA,
      {
        action: PolicyAction.EVIDENCE_VIEW,
        dataClass: DataClass.SENSITIVE,
        areaParam: "areaId",
        caseParam: "caseId",
      } satisfies RequiredPolicyMetadata,
      handler,
    );
    const audit = new InMemorySecurityAuditSink();
    const guard = new AuthorizationGuard(
      new Reflector(),
      new AuthorizationPolicy(),
      { authenticate: async () => dispatcherScope },
      audit,
    );
    const httpRequest = request();
    httpRequest.params = {
      areaId: "area-a",
      caseId: "00000000-0000-4000-8000-000000000399",
      evidenceId: "00000000-0000-4000-8000-000000000398",
    };
    await expect(
      guard.canActivate(executionContext(handler, httpRequest)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.events.at(-1)).toMatchObject({
      action: PolicyAction.EVIDENCE_VIEW,
      outcome: "DENIED",
      reason: "CASE_SCOPE_MISMATCH",
      resourceId: "00000000-0000-4000-8000-000000000399",
    });
    expect(JSON.stringify(audit.events)).not.toContain(
      "00000000-0000-4000-8000-000000000398",
    );
  });
});
