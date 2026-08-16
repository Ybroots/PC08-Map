import { DataClass, OfficerRole } from "@atgt/authorization";
import type { AppConfig } from "@atgt/config";
import { AuthenticationFailure } from "./identity.types";
import { MockIdentityProvider } from "./mock-identity.provider";
import { mapOidcClaims } from "./oidc-claims.mapper";
import { InMemorySessionRevocationStore } from "./session-revocation.store";

const identityConfig = (): AppConfig["identity"] => ({
  oidcIssuer: "http://localhost:8080/realms/atgt",
  clientId: "atgt-api",
  audience: "atgt-api",
  jwksCacheTtlMs: 600_000,
  useMock: true,
  mock: {
    token: "local-test-token",
    subject: "local-officer",
    role: OfficerRole.DISPATCHER,
    unitIds: ["unit-a"],
    areaIds: ["area-a"],
    assignedCaseIds: ["case-a"],
    maxDataClass: DataClass.SENSITIVE,
    authenticationMethods: ["pwd", "mfa"],
    sessionId: "session-a",
  },
});

describe("OIDC identity mapping", () => {
  it("maps verified claims to a normalized access scope", () => {
    const scope = mapOidcClaims({
      iss: "https://identity.example.test",
      sub: "officer-1",
      sid: "session-1",
      atgt_role: OfficerRole.FIELD_OFFICER,
      atgt_unit_ids: ["unit-a"],
      atgt_area_ids: ["area-a"],
      atgt_case_ids: ["case-a"],
      atgt_data_class: DataClass.SENSITIVE,
      amr: ["pwd", "mfa"],
    });
    expect(scope).toMatchObject({
      role: OfficerRole.FIELD_OFFICER,
      sessionId: "session-1",
      unitIds: ["unit-a"],
      assignedCaseIds: ["case-a"],
    });
    expect(scope.principalId).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    { sid: undefined },
    { atgt_role: "super_admin" },
    { atgt_data_class: "top_secret" },
  ])("rejects incomplete or unknown claims: %o", (override) => {
    expect(() =>
      mapOidcClaims({
        iss: "https://identity.example.test",
        sub: "officer-1",
        sid: "session-1",
        atgt_role: OfficerRole.DISPATCHER,
        atgt_data_class: DataClass.INTERNAL,
        ...override,
      }),
    ).toThrow(AuthenticationFailure);
  });
});

describe("local mock identity adapter", () => {
  it("accepts only the configured opaque token", async () => {
    const provider = new MockIdentityProvider(
      identityConfig(),
      new InMemorySessionRevocationStore(),
    );
    await expect(
      provider.authenticate("local-test-token"),
    ).resolves.toMatchObject({
      role: OfficerRole.DISPATCHER,
      principalId: "local-officer",
    });
    await expect(provider.authenticate("wrong-token")).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("rejects a revoked session", async () => {
    const revocations = new InMemorySessionRevocationStore();
    revocations.revoke("session-a");
    const provider = new MockIdentityProvider(identityConfig(), revocations);
    await expect(
      provider.authenticate("local-test-token"),
    ).rejects.toMatchObject({
      code: "SESSION_REVOKED",
    });
  });
});
