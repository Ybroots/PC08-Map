import { DynamicModule, Module } from "@nestjs/common";
import type { AppConfig } from "@atgt/config";
import type { Pool } from "pg";
import {
  DATABASE_POOL,
  PostgresOutboxWriter,
  PostgresTransactionManager,
} from "../../platform/database";
import { PublicReportController } from "./report.controller";
import { PostgresReportRepository } from "./report.repository";

@Module({})
export class ReportsModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: ReportsModule,
      controllers: [PublicReportController],
      providers: [
        {
          provide: PostgresReportRepository,
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
            new PostgresReportRepository(
              pool,
              transactions,
              outbox,
              config.reportIntake,
            ),
        },
      ],
    };
  }
}
