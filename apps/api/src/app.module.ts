import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  NestModule,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import type { AppConfig } from "@atgt/config";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { MapProviderModule } from "./modules/map-provider/map-provider.module";
import { MapDataModule } from "./modules/map-data/map-data.module";
import { IncidentsModule } from "./modules/incidents/incidents.module";
import { DatabaseModule } from "./platform/database";
import { ProblemDetailsFilter } from "./platform/problem-details.filter";
import { RequestContextMiddleware } from "./platform/request-context.middleware";

/**
 * AppModule - Root module for ATGT Platform API
 *
 * T00: Health-only stub. Feature modules (incidents, dispatch, reports,
 * evidence, map-data, vietmap-adapter, audit, notifications, analytics)
 * are added in subsequent tasks (T03-T16).
 *
 * IMPORTANT: No module may import another module's internal repository.
 * Cross-module access uses public application services or domain events only.
 */
@Module({})
export class AppModule implements NestModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.register(config),
        HealthModule,
        IdentityModule.register(config),
        MapProviderModule.register(config),
        MapDataModule,
        IncidentsModule.register(config),
      ],
      providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
