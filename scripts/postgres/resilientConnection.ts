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
 */

import { setTimeout as sleep } from "node:timers/promises";
import { Pool, type PoolClient } from "pg";

export const MAX_ATTEMPTS = 6;
/** Client-side wait for one statement's result before the socket is treated as dead. */
export const QUERY_TIMEOUT_MS = 120_000;
/** Wait for a new socket and TLS handshake; a half-open path otherwise blocks `pool.connect()` forever. */
const CONNECT_TIMEOUT_MS = 30_000

/** Two-client pool (PlanetScale caps direct connections at 25) with the timeouts `Connection` relies on. */
export function resilientPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 2, query_timeout: QUERY_TIMEOUT_MS, connectionTimeoutMillis: CONNECT_TIMEOUT_MS, keepAlive: true });
}

function isQueryable(client: PoolClient): boolean {
  // `pg` flips this private flag when the socket dies mid-query.
  return !("_queryable" in client && client._queryable === false);
}

function isConnectionLoss(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return (
    /connection terminated|not queryable|ECONNRESET|EPIPE|ETIMEDOUT|server closed the connection|Query read timeout|timeout exceeded when trying to connect/i.test(message) ||
    code === "57P01" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT"
  );
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
        if (!isConnectionLoss(error) || attempt >= MAX_ATTEMPTS) throw error;
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
