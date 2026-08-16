import type { AppConfig } from "@atgt/config";
import type { AccessScope } from "@atgt/authorization";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  AuthenticationFailure,
  type IdentityProviderPort,
  type SessionRevocationStore,
} from "./identity.types";
import { mapOidcClaims } from "./oidc-claims.mapper";

export class OidcIdentityProvider implements IdentityProviderPort {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly config: AppConfig["identity"],
    private readonly revocations: SessionRevocationStore,
  ) {
    if (!config.jwksUri || config.useMock) {
      throw new Error("Remote OIDC provider requires a trusted JWKS URI");
    }
    this.jwks = createRemoteJWKSet(new URL(config.jwksUri), {
      cacheMaxAge: config.jwksCacheTtlMs,
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    });
  }

  async authenticate(token: string): Promise<AccessScope> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.config.oidcIssuer,
        audience: this.config.audience,
        algorithms: ["RS256", "ES256"],
      });
      const scope = mapOidcClaims(payload);
      if (
        !scope.sessionId ||
        (await this.revocations.isRevoked(scope.sessionId))
      ) {
        throw new AuthenticationFailure("SESSION_REVOKED");
      }
      return scope;
    } catch (error) {
      if (error instanceof AuthenticationFailure) throw error;
      throw new AuthenticationFailure("INVALID_TOKEN");
    }
  }
}
