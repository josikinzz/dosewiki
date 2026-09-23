import type { PoolClient } from "pg";

export const POOL_ACQUISITION_TIMEOUT_MS = 10_000;

/**
 * Client-side ceiling on one statement's round trip, above the 30s server
 * statement_timeout so a slow query still fails with the server's 57014. It
 * only fires when the socket went silent without closing, which TCP would
 * otherwise take many minutes to notice.
 */
export const QUERY_READ_TIMEOUT_MS = 45_000;

const TRANSACTION_TIMEOUTS_SQL = `
  SET LOCAL statement_timeout = '30s';
  SET LOCAL lock_timeout = '5s';
  SET LOCAL idle_in_transaction_session_timeout = '30s'
`;

export async function setTransactionTimeouts(client: Pick<PoolClient, "query">): Promise<void> {
  await client.query(TRANSACTION_TIMEOUTS_SQL);
}

/** `begin` and the bounded timeouts in one round trip. Parameterless, so pg sends it as one simple query. */
export function beginWithTimeouts(begin: string): string {
  return `${begin};${TRANSACTION_TIMEOUTS_SQL}`;
}
