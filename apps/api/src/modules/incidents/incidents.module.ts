import { DynamicModule, Module } from "@nestjs/common";
import type { AppConfig } from "@atgt/config";
import type { Pool } from "pg";
import {
  DATABASE_POOL,
  PostgresOutboxWriter,
  PostgresTransactionManager,
} from "../../platform/database";
import {
  IncidentMetricsController,
  OpsIncidentController,
  PublicIncidentController,
} from "./incident.controller";
import { IncidentMetrics } from "./incident.metrics";
import { PostgresIncidentRepository } from "./incident.repository";

@Module({})
export class IncidentsModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: IncidentsModule,
      controllers: [
        PublicIncidentController,
        OpsIncidentController,
        IncidentMetricsController,
      ],
      providers: [
        IncidentMetrics,
        {
          provide: PostgresIncidentRepository,
          inject: [
            DATABASE_POOL,
            PostgresTransactionManager,
            PostgresOutboxWriter,
          ],
          useFactory: (
            pool: Pool,
            transactions: PostgresTransactionManager,
            outbox: PostgresOutboxWriter,
          ) =>
            new PostgresIncidentRepository(
              pool,
              transactions,
              outbox,
              config.sosIntake,
            ),
        },
      ],
    };
  }
}
