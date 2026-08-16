import type { Pool, PoolClient } from "pg";

export const DATABASE_POOL = Symbol("DATABASE_POOL");

export type QueryExecutor = Pick<Pool | PoolClient, "query">;

export interface DatabaseTransactionManager {
  execute<T>(work: (client: PoolClient) => Promise<T>): Promise<T>;
}
