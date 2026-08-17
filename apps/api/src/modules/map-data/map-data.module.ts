import { Module } from "@nestjs/common";
import type { Pool } from "pg";
import {
  DATABASE_POOL,
  PostgresOutboxWriter,
  PostgresTransactionManager,
} from "../../platform/database";
import { MapDataController } from "./map-data.controller";
import { PostgresMapDataRepository } from "./map-data.repository";

@Module({
  controllers: [MapDataController],
  providers: [
    {
      provide: PostgresMapDataRepository,
      inject: [DATABASE_POOL, PostgresTransactionManager, PostgresOutboxWriter],
      useFactory: (
        pool: Pool,
        transactions: PostgresTransactionManager,
        outbox: PostgresOutboxWriter,
      ) => new PostgresMapDataRepository(pool, transactions, outbox),
    },
  ],
})
export class MapDataModule {}
