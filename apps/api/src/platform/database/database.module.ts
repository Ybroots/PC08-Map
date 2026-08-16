import { DynamicModule, Global, Module } from "@nestjs/common";
import type { AppConfig } from "@atgt/config";
import type { Pool } from "pg";
import { DatabasePool } from "./database-pool";
import { DATABASE_POOL } from "./database.types";
import { PostgresInboxStore } from "./inbox-store";
import { PostgresOutboxWriter } from "./outbox-writer";
import { PostgresTransactionManager } from "./transaction-manager";

@Global()
@Module({})
export class DatabaseModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DatabasePool,
          useFactory: () => new DatabasePool(config),
        },
        {
          provide: DATABASE_POOL,
          inject: [DatabasePool],
          useFactory: (database: DatabasePool): Pool => database.pool,
        },
        {
          provide: PostgresTransactionManager,
          inject: [DATABASE_POOL],
          useFactory: (pool: Pool) => new PostgresTransactionManager(pool),
        },
        PostgresOutboxWriter,
        PostgresInboxStore,
      ],
      exports: [
        DATABASE_POOL,
        PostgresTransactionManager,
        PostgresOutboxWriter,
        PostgresInboxStore,
      ],
    };
  }
}
