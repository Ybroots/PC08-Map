import type { Pool, PoolClient } from "pg";
import type { DatabaseTransactionManager } from "./database.types";

export class PostgresTransactionManager implements DatabaseTransactionManager {
  constructor(private readonly pool: Pool) {}

  async execute<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
