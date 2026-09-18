import type { PoolClient } from "pg";

export const POOL_ACQUISITION_TIMEOUT_MS = 10_000;

const TRANSACTION_TIMEOUTS_SQL = `
  SET LOCAL statement_timeout = '30s';
  SET LOCAL lock_timeout = '5s';
  SET LOCAL idle_in_transaction_session_timeout = '30s'
`;

export async function setTransactionTimeouts(client: Pick<PoolClient, "query">): Promise<void> {
  await client.query(TRANSACTION_TIMEOUTS_SQL);
}
