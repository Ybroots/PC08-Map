import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import type { AppConfig } from "@atgt/config";
import { Pool } from "pg";

@Injectable()
export class DatabasePool implements OnApplicationShutdown {
  readonly pool: Pool;

  constructor(config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.database.url,
      application_name: "atgt-api",
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
