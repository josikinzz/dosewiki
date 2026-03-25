import "server-only";

import { cache } from "react";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { getServerConvexUrl } from "./serverWriteHealth";

type QueryArgs = Record<string, unknown>;

export const getServerConvexClient = cache(() => {
  const url = getServerConvexUrl();

  if (!url) {
    throw new Error(
      "Convex URL is not configured. Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL."
    );
  }

  return new ConvexHttpClient(url);
});

export async function queryConvex<Result, Args extends QueryArgs = Record<string, never>>(
  name: string,
  args: Args
): Promise<Result> {
  const reference = makeFunctionReference<"query", Args, Result>(name);
  return await getServerConvexClient().query(reference, args as never);
}
