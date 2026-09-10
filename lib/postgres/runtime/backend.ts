import "server-only";

import { PostgresConvexClient } from "./client";

export type DataBackend = "convex" | "postgres";

/**
 * Which persistence serves this process. Explicit only: a preview build must
 * never inherit a production writer through env fallback (ticket 19), so an
 * unset or unknown value means Convex.
 */
export function getDataBackend(): DataBackend {
  return process.env.DATA_BACKEND === "postgres" ? "postgres" : "convex";
}

let cached: PostgresConvexClient | null = null;
let cachedUrl: string | null = null;

/** Application traffic uses the pooled PlanetScale port; migrations keep the direct URL. */
export function getPostgresConvexClient(): PostgresConvexClient {
  const url = process.env.POSTGRES_POOLED_URL || process.env.POSTGRES_DIRECT_URL;
  if (!url) throw new Error("DATA_BACKEND=postgres requires POSTGRES_POOLED_URL or POSTGRES_DIRECT_URL");
  if (!cached || cachedUrl !== url) {
    cached = PostgresConvexClient.fromUrl(url);
    cachedUrl = url;
  }
  return cached;
}
