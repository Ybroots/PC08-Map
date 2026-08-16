import { DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthorizationPolicy } from "@atgt/authorization";
import type { AppConfig } from "@atgt/config";
import { AuthorizationGuard } from "./authorization.guard";
import { CitizenSessionController } from "./citizen-session.controller";
import { CitizenSessionService } from "./citizen-session.service";
import { IdentityDatabase } from "./identity-database";
import {
  CITIZEN_SESSION_STORE,
  IDENTITY_PROVIDER,
  RUNTIME_CONFIG,
  SECURITY_AUDIT_SINK,
  SESSION_REVOCATION_STORE,
  type SessionRevocationStore,
} from "./identity.types";
import { MockIdentityProvider } from "./mock-identity.provider";
import { OidcIdentityProvider } from "./oidc-identity.provider";
import { PostgresCitizenSessionStore } from "./postgres-citizen-session.store";
import { PostgresSecurityAuditSink } from "./security-audit.sink";
import { PostgresSessionRevocationStore } from "./session-revocation.store";

@Module({})
export class IdentityModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [CitizenSessionController],
      providers: [
        { provide: RUNTIME_CONFIG, useValue: config },
        IdentityDatabase,
        AuthorizationPolicy,
        {
          provide: SESSION_REVOCATION_STORE,
          inject: [IdentityDatabase],
          useFactory: (database: IdentityDatabase) =>
            new PostgresSessionRevocationStore(database.pool),
        },
        {
          provide: CITIZEN_SESSION_STORE,
          inject: [IdentityDatabase],
          useFactory: (database: IdentityDatabase) =>
            new PostgresCitizenSessionStore(database.pool),
        },
        {
          provide: SECURITY_AUDIT_SINK,
          inject: [IdentityDatabase],
          useFactory: (database: IdentityDatabase) =>
            new PostgresSecurityAuditSink(database.pool),
        },
        {
          provide: IDENTITY_PROVIDER,
          inject: [RUNTIME_CONFIG, SESSION_REVOCATION_STORE],
          useFactory: (
            runtimeConfig: AppConfig,
            revocations: SessionRevocationStore,
          ) =>
            runtimeConfig.identity.useMock
              ? new MockIdentityProvider(runtimeConfig.identity, revocations)
              : new OidcIdentityProvider(runtimeConfig.identity, revocations),
        },
        {
          provide: CitizenSessionService,
          inject: [CITIZEN_SESSION_STORE, RUNTIME_CONFIG],
          useFactory: (
            store: PostgresCitizenSessionStore,
            runtimeConfig: AppConfig,
          ) =>
            new CitizenSessionService(
              store,
              runtimeConfig.citizenSession.ttlMinutes,
              runtimeConfig.citizenSession.rotateAfterMinutes,
            ),
        },
        {
          provide: APP_GUARD,
          useClass: AuthorizationGuard,
        },
      ],
      exports: [CitizenSessionService, IDENTITY_PROVIDER],
    };
  }
}
