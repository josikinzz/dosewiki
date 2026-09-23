/**
 * One checked-out `pg` client that is replaced when the socket drops, shared
 * by the forward importer and the reverse exporter. Every statement they issue
 * is idempotent (upsert by `_id`, keyset SELECT, TRUNCATE), so a dropped or
 * stalled statement is simply replayed on a fresh client. Batches commit
 * individually: a long-lived transaction cannot survive a network path that
 * cuts sustained transfers, and resumability by `_id` is the contract anyway.
 *
 * A half-open socket raises nothing, so callers construct their pool with a
 * client-side `query_timeout`; pg's "Query read timeout" counts as loss here.
 * What counts as replayable is `isReplayableOnFreshConnection`, the same
 * vocabulary the runtime client retries with.
 */

import { setTimeout as sleep } from "node:timers/promises";
import { Pool, type PoolClient } from "pg";
import { isReplayableOnFreshConnection } from "../../lib/postgres/postgresErrors.ts";
import { RUNTIME_POOL_OPTIONS } from "../../lib/postgres/transactionTimeouts.ts";

export const MAX_ATTEMPTS = 6;
/**
 * Client-side wait for one statement's result before the socket is treated as
 * dead. Longer than the runtime's read ceiling: bulk upserts run in autocommit
 * with no server `statement_timeout`, so a large batch may legitimately take it.
 */
export const QUERY_TIMEOUT_MS = 120_000;
/** Wait for a new socket and TLS handshake; a half-open path otherwise blocks `pool.connect()` forever. */
const CONNECT_TIMEOUT_MS = 30_000;

/** Two-client pool (PlanetScale caps direct connections at 25): the runtime pool options with the importer's longer waits. */
export function resilientPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 2, ...RUNTIME_POOL_OPTIONS, query_timeout: QUERY_TIMEOUT_MS, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
}

function isQueryable(client: PoolClient): boolean {
  // `pg` flips this private flag when the socket dies mid-query.
  return !("_queryable" in client && client._queryable === false);
}

export class Connection {
  private client: PoolClient | null = null;
  constructor(private readonly pool: Pool) {
    // A dropped socket also surfaces as an 'error' event on the pool and on the
    // checked-out client; without listeners Node treats it as an uncaught exception.
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
        // The stalled client must not be reused; `release(true)` destroys it.
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
