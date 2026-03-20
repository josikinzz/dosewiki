import "server-only";

import { cache } from "react";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

type QueryArgs = Record<string, unknown>;

function getServerConvexUrl(): string {
  const url =
    process.env.CONVEX_URL ??
    process.env.VITE_CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!url) {
    throw new Error(
      "Convex URL is not configured. Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL."
    );
  }

  return url;
}

export const getServerConvexClient = cache(() => {
  return new ConvexHttpClient(getServerConvexUrl());
});

export async function queryConvex<Result, Args extends QueryArgs = Record<string, never>>(
  name: string,
  args: Args
): Promise<Result> {
  const reference = makeFunctionReference<"query", Args, Result>(name);
  return await getServerConvexClient().query(reference, args as never);
}
