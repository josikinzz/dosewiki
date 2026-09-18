import "server-only";

import { makeFunctionReference } from "../postgres/runtime/api";
import { getPostgresClient } from "../postgres/runtime/backend";
import type { PostgresClient } from "../postgres/runtime/client";

type QueryArgs = Record<string, unknown>;
const QUERY_RETRY_DELAYS_MS = [250, 750, 1500] as const;

/** Function-reference client for reads through the in-process Postgres runtime. */
export type ServerReadClient = Pick<PostgresClient, "query">;

export function getServerDataReadClient(): ServerReadClient {
  return getPostgresClient();
}



function isRetryableQueryError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const cause = (error as Error & { cause?: { code?: string } }).cause;
  const code = typeof cause?.code === "string" ? cause.code.toUpperCase() : "";

  return (
    message.includes("fetch failed") ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function queryData<Result, Args extends QueryArgs = Record<string, never>>(
  name: string,
  args: Args
): Promise<Result> {
  const reference = makeFunctionReference<"query", Args, Result>(name);

  for (let attempt = 0; attempt <= QUERY_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await getServerDataReadClient().query(reference, args as never);
    } catch (error) {
      if (!isRetryableQueryError(error) || attempt === QUERY_RETRY_DELAYS_MS.length) {
        throw error;
      }

      await wait(QUERY_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error(`Unreachable retry state while querying Postgres function "${name}".`);
}
