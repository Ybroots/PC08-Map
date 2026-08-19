import { DynamicModule, Module } from "@nestjs/common";
import type { AppConfig } from "@atgt/config";
import type { Pool } from "pg";
import {
  DATABASE_POOL,
  PostgresOutboxWriter,
  PostgresTransactionManager,
} from "../../platform/database";
import { EvidenceAccessService } from "./evidence-access.service";
import { EvidenceAccessMetrics } from "./evidence-access.metrics";
import { PostgresEvidenceAccessRepository } from "./evidence-access.repository";
import {
  EvidenceController,
  EvidenceAccessMetricsController,
  OpsEvidenceController,
} from "./evidence.controller";
import { PostgresEvidenceRepository } from "./evidence.repository";
import { EvidenceService } from "./evidence.service";
import { EvidenceFailure } from "./evidence.types";
import { S3EvidenceStorageAdapter } from "./s3-evidence-storage.adapter";
import { EvidenceAttachmentService } from "./evidence-attachment.service";

@Module({})
export class EvidenceModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: EvidenceModule,
      controllers: [
        EvidenceController,
        OpsEvidenceController,
        EvidenceAccessMetricsController,
      ],
      providers: [
        EvidenceAttachmentService,
        EvidenceAccessMetrics,
        {
          provide: PostgresEvidenceAccessRepository,
          inject: [DATABASE_POOL],
          useFactory: (pool: Pool) =>
            new PostgresEvidenceAccessRepository(pool),
        },
        {
          provide: PostgresEvidenceRepository,
          inject: [
            DATABASE_POOL,
            PostgresTransactionManager,
            PostgresOutboxWriter,
          ],
          useFactory: (
            pool: Pool,
            transactions: PostgresTransactionManager,
            outbox: PostgresOutboxWriter,
          ) => new PostgresEvidenceRepository(pool, transactions, outbox),
        },
        {
          provide: S3EvidenceStorageAdapter,
          useFactory: () => {
            const { region, accessKey, secretKey } = config.storage;
            if (!region || !accessKey || !secretKey) return null;
            return new S3EvidenceStorageAdapter({
              endpoint: config.storage.endpoint,
              region,
              accessKey,
              secretKey,
              bucketQuarantine: config.storage.bucketQuarantine,
              bucketOriginal: config.storage.bucketOriginal,
              bucketDerivative: config.storage.bucketDerivative,
              forcePathStyle: config.storage.forcePathStyle,
            });
          },
        },
        {
          provide: EvidenceService,
          inject: [PostgresEvidenceRepository, S3EvidenceStorageAdapter],
          useFactory: (
            repository: PostgresEvidenceRepository,
            storage: S3EvidenceStorageAdapter | null,
          ) =>
            new EvidenceService(
              repository,
              storage ?? {
                createUploadUrl: async () => {
                  throw new EvidenceFailure("CONFIGURATION_BLOCKED");
                },
                inspectQuarantineObject: async () => {
                  throw new EvidenceFailure("CONFIGURATION_BLOCKED");
                },
              },
              config.evidence,
            ),
        },
        {
          provide: EvidenceAccessService,
          inject: [
            PostgresEvidenceAccessRepository,
            S3EvidenceStorageAdapter,
            EvidenceAccessMetrics,
          ],
          useFactory: (
            repository: PostgresEvidenceAccessRepository,
            storage: S3EvidenceStorageAdapter | null,
            metrics: EvidenceAccessMetrics,
          ) =>
            new EvidenceAccessService(
              repository,
              storage ?? {
                createReadUrl: async () => {
                  throw new EvidenceFailure("CONFIGURATION_BLOCKED");
                },
              },
              config.evidence,
              metrics,
            ),
        },
      ],
      exports: [EvidenceAttachmentService],
    };
  }
}
