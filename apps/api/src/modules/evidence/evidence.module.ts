import { DynamicModule, Module } from "@nestjs/common";
import type { AppConfig } from "@atgt/config";
import type { Pool } from "pg";
import {
  DATABASE_POOL,
  PostgresOutboxWriter,
  PostgresTransactionManager,
} from "../../platform/database";
import { EvidenceController } from "./evidence.controller";
import { PostgresEvidenceRepository } from "./evidence.repository";
import { EvidenceService } from "./evidence.service";
import { EvidenceFailure } from "./evidence.types";
import { S3EvidenceStorageAdapter } from "./s3-evidence-storage.adapter";

@Module({})
export class EvidenceModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: EvidenceModule,
      controllers: [EvidenceController],
      providers: [
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
      ],
    };
  }
}
