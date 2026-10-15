import { setTimeout as sleep } from "node:timers/promises";
import { Pool, type PoolClient } from "pg";
import { isReplayableOnFreshConnection } from "../../lib/postgres/postgresErrors.ts";
import { RUNTIME_POOL_OPTIONS } from "../../lib/postgres/transactionTimeouts.ts";

export const MAX_ATTEMPTS = 6;
export const QUERY_TIMEOUT_MS = 120_000;
const CONNECT_TIMEOUT_MS = 30_000;

export function resilientPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 2, ...RUNTIME_POOL_OPTIONS, query_timeout: QUERY_TIMEOUT_MS, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
}

function isQueryable(client: PoolClient): boolean {
  return !("_queryable" in client && client._queryable === false);
}

export class Connection {
  private client: PoolClient | null = null;
  constructor(private readonly pool: Pool) {
    pool.on("error", () => {});
  }
  private async acquire(): Promise<PoolClient> {
    if (this.client && isQueryable(this.client)) return this.client;
    this.client?.release(true);
    this.client = null;
    const client = await this.pool.connect();
    client.on("error", () => {});
    this.client = client;
    return client;
  }
  async run<T>(label: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn(await this.acquire());
      } catch (error) {
        if (!isReplayableOnFreshConnection(error) || attempt >= MAX_ATTEMPTS) throw error;
        console.warn(`${label}: ${error instanceof Error ? error.message : String(error)} on attempt ${attempt}, reconnecting`);
        this.client?.release(true);
        this.client = null;
        await sleep(500 * attempt);
      }
    }
  }
  release(): void {
    if (this.client && isQueryable(this.client)) this.client.release();
    else this.client?.release(true);
    this.client = null;
  }
}
