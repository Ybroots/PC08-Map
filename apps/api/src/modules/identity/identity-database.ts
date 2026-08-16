import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import type { AppConfig } from "@atgt/config";
import { Pool } from "pg";
import { RUNTIME_CONFIG } from "./identity.types";

@Injectable()
export class IdentityDatabase implements OnApplicationShutdown {
  readonly pool: Pool;

  constructor(@Inject(RUNTIME_CONFIG) config: AppConfig) {
    this.pool = new Pool({ connectionString: config.database.url, max: 5 });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
