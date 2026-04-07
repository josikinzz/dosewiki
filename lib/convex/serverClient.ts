import "server-only";

import { cache } from "react";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { getServerConvexReadUrl, getServerConvexWriteUrl } from "./serverWriteHealth";

type QueryArgs = Record<string, unknown>;

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

export async function queryConvex<Result, Args extends QueryArgs = Record<string, never>>(
  name: string,
  args: Args
): Promise<Result> {
  const reference = makeFunctionReference<"query", Args, Result>(name);
  return await getServerConvexReadClient().query(reference, args as never);
}
