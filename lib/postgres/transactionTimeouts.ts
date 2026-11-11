import type { PoolClient, PoolConfig } from "pg";

export const POOL_ACQUISITION_TIMEOUT_MS = 5_000;

export const QUERY_READ_TIMEOUT_MS = 45_000;

export const RUNTIME_POOL_OPTIONS = {
  keepAlive: true,
  idleTimeoutMillis: 5_000,
  query_timeout: QUERY_READ_TIMEOUT_MS,
  connectionTimeoutMillis: POOL_ACQUISITION_TIMEOUT_MS,
} as const satisfies PoolConfig;

const TRANSACTION_TIMEOUTS = [
  "SET LOCAL statement_timeout = '30s'",
  "SET LOCAL lock_timeout = '5s'",
  "SET LOCAL idle_in_transaction_session_timeout = '30s'",
] as const;

export async function beginWithTimeouts(client: Pick<PoolClient, "query">, begin: string): Promise<void> {
  await client.query(begin);
  await setTransactionTimeouts(client);
}

export async function setTransactionTimeouts(client: Pick<PoolClient, "query">): Promise<void> {
  for (const statement of TRANSACTION_TIMEOUTS) {
    await client.query(statement);
  }
}
