import "server-only";

import { PostgresClient } from "./client";

import { requirePostgresBackend, resolveRuntimePostgresTarget, type DataBackend } from "./target";

export type { DataBackend };

export function getDataBackend(): DataBackend {
  return requirePostgresBackend();
}

let cached: PostgresClient | null = null;
let cachedUrl: string | null = null;

export function getPostgresClient(): PostgresClient {
  const { url } = resolveRuntimePostgresTarget();
  if (!cached || cachedUrl !== url) {
    cached = PostgresClient.fromUrl(url);
    cachedUrl = url;
  }
  return cached;
}
