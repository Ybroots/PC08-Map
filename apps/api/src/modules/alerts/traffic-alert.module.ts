import { DynamicModule, Module } from "@nestjs/common";
import type { AppConfig } from "@atgt/config";
import type { Pool } from "pg";
import { DATABASE_POOL } from "../../platform/database";
import { TrafficAlertController } from "./traffic-alert.controller";
import { PostgresTrafficAlertRepository } from "./traffic-alert.repository";

@Module({})
export class TrafficAlertModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: TrafficAlertModule,
      controllers: [TrafficAlertController],
      providers: [
        {
          provide: PostgresTrafficAlertRepository,
          inject: [DATABASE_POOL],
          useFactory: (pool: Pool) =>
            new PostgresTrafficAlertRepository(pool, config.trafficAlerts),
        },
      ],
    };
  }
}
