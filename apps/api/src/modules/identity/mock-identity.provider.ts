import { timingSafeEqual } from "node:crypto";
import {
  createAccessScope,
  DataClass,
  OfficerRole,
  type AccessScope,
} from "@atgt/authorization";
import type { AppConfig } from "@atgt/config";
import {
  AuthenticationFailure,
  type IdentityProviderPort,
  type SessionRevocationStore,
} from "./identity.types";

function tokensMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export class MockIdentityProvider implements IdentityProviderPort {
  constructor(
    private readonly config: AppConfig["identity"],
    private readonly revocations: SessionRevocationStore,
  ) {
    if (!config.useMock || !config.mock) {
      throw new Error("Mock identity configuration is incomplete");
    }
  }

  async authenticate(token: string): Promise<AccessScope> {
    const mock = this.config.mock;
    if (!mock || !tokensMatch(token, mock.token)) {
      throw new AuthenticationFailure("INVALID_TOKEN");
    }
    if (await this.revocations.isRevoked(mock.sessionId)) {
      throw new AuthenticationFailure("SESSION_REVOKED");
    }
    return createAccessScope({
      principalId: mock.subject,
      role: mock.role as OfficerRole,
      unitIds: mock.unitIds,
      areaIds: mock.areaIds,
      assignedCaseIds: mock.assignedCaseIds,
      maxDataClass: mock.maxDataClass as DataClass,
      authenticationMethods: mock.authenticationMethods,
      sessionId: mock.sessionId,
    });
  }
}
