import type { PoolClient, PoolConfig } from "pg";

export const POOL_ACQUISITION_TIMEOUT_MS = 10_000;

export const QUERY_READ_TIMEOUT_MS = 45_000;

export const RUNTIME_POOL_OPTIONS = {
  keepAlive: true,
  query_timeout: QUERY_READ_TIMEOUT_MS,
  connectionTimeoutMillis: POOL_ACQUISITION_TIMEOUT_MS,
} as const satisfies PoolConfig;

const TRANSACTION_TIMEOUTS_SQL = `
  SET LOCAL statement_timeout = '30s';
  SET LOCAL lock_timeout = '5s';
  SET LOCAL idle_in_transaction_session_timeout = '30s'
`;

export async function setTransactionTimeouts(client: Pick<PoolClient, "query">): Promise<void> {
  await client.query(TRANSACTION_TIMEOUTS_SQL);
}

export function beginWithTimeouts(begin: string): string {
  return `${begin};${TRANSACTION_TIMEOUTS_SQL}`;
}
