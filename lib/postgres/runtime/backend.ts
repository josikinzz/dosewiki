import "server-only";

import { PostgresClient } from "./client";

import { requirePostgresBackend, resolveRuntimePostgresTarget, type DataBackend } from "./target";

export type { DataBackend };

/** Normal traffic never falls back to the frozen recovery backend. */
export function getDataBackend(): DataBackend {
  return requirePostgresBackend();
}

let cached: PostgresClient | null = null;
let cachedUrl: string | null = null;

/** Application traffic uses the pooled PlanetScale port; migrations keep the direct URL. */
export function getPostgresClient(): PostgresClient {
  const { url } = resolveRuntimePostgresTarget();
  if (!cached || cachedUrl !== url) {
    cached = PostgresClient.fromUrl(url);
    cachedUrl = url;
  }
  return cached;
}
