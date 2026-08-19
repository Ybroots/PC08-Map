import { DynamicModule, Module } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import type { AppConfig } from "@atgt/config";
import type { Pool } from "pg";
import {
  DATABASE_POOL,
  PostgresOutboxWriter,
  PostgresTransactionManager,
} from "../../platform/database";
import { PublicReportController } from "./report.controller";
import { PostgresReportRepository } from "./report.repository";
import { EvidenceAttachmentService } from "../evidence/evidence-attachment.service";
import { OpsReportController } from "./report-ops.controller";
import { PostgresReportOpsRepository } from "./report-ops.repository";

@Module({})
export class ReportsModule {
  static register(
    config: AppConfig,
    evidenceModule: NestDynamicModule,
  ): DynamicModule {
    return {
      module: ReportsModule,
      imports: [evidenceModule],
      controllers: [PublicReportController, OpsReportController],
      providers: [
        {
          provide: PostgresReportOpsRepository,
          inject: [
            DATABASE_POOL,
            PostgresTransactionManager,
            PostgresOutboxWriter,
          ],
          useFactory: (
            pool: Pool,
            transactions: PostgresTransactionManager,
            outbox: PostgresOutboxWriter,
          ) => new PostgresReportOpsRepository(pool, transactions, outbox),
        },
        {
          provide: PostgresReportRepository,
          inject: [
            DATABASE_POOL,
            PostgresTransactionManager,
            PostgresOutboxWriter,
            EvidenceAttachmentService,
          ],
          useFactory: (
            pool: Pool,
            transactions: PostgresTransactionManager,
            outbox: PostgresOutboxWriter,
            evidenceAttachments: EvidenceAttachmentService,
          ) =>
            new PostgresReportRepository(
              pool,
              transactions,
              outbox,
              config.reportIntake,
              evidenceAttachments,
            ),
        },
      ],
    };
  }
}
