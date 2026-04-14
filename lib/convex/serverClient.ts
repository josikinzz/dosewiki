import "server-only";

import { cache } from "react";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { getServerConvexReadUrl, getServerConvexWriteUrl } from "./serverWriteHealth";

type QueryArgs = Record<string, unknown>;
const QUERY_RETRY_DELAYS_MS = [250, 750, 1500] as const;

export const getServerConvexReadClient = cache(() => {
  const url = getServerConvexReadUrl();

  if (!url) {
    throw new Error(
      "Convex read URL is not configured. Set CONVEX_PUBLIC_READ_URL or a default Convex URL."
    );
  }

  return new ConvexHttpClient(url);
});

export const getServerConvexWriteClient = cache(() => {
  const url = getServerConvexWriteUrl();

  if (!url) {
    throw new Error(
      "Convex write URL is not configured. Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL."
    );
  }

  return new ConvexHttpClient(url);
});

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

export async function queryConvex<Result, Args extends QueryArgs = Record<string, never>>(
  name: string,
  args: Args
): Promise<Result> {
  const reference = makeFunctionReference<"query", Args, Result>(name);

  for (let attempt = 0; attempt <= QUERY_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await getServerConvexReadClient().query(reference, args as never);
    } catch (error) {
      if (!isRetryableQueryError(error) || attempt === QUERY_RETRY_DELAYS_MS.length) {
        throw error;
      }

      await wait(QUERY_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error(`Unreachable retry state while querying Convex function "${name}".`);
}
