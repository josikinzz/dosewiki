import { z } from "zod";
import type { PublicSubstancePreview, PublicSubstanceRecord } from "@server/convex/publicData";

export const PUBLIC_API_VERSION = "v1" as const;
export const PUBLIC_API_BASE_PATH = "/api/v1" as const;
export const PUBLIC_API_DEFAULT_LIMIT = 25;
export const PUBLIC_API_MAX_LIMIT = 100;
export const PUBLIC_API_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=3600";
export const PUBLIC_API_CDN_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";
export const PUBLIC_API_DISCLAIMER =
  "DoseWiki content is provided for harm-reduction education and is not medical advice.";

const cursorSchema = z.object({ offset: z.number().int().nonnegative() });

export type PublicApiErrorCode =
  | "invalid_request"
  | "invalid_cursor"
  | "not_found"
  | "service_unavailable";

export function getPublicApiCorsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Max-Age": "86400",
  });
}

export function applyPublicApiCors(response: Response): Response {
  for (const [key, value] of getPublicApiCorsHeaders()) response.headers.set(key, value);
  return response;
}

export function getPublicApiResponseHeaders(options: { cache?: boolean } = {}): Headers {
  const headers = getPublicApiCorsHeaders();
  headers.set("X-Content-Type-Options", "nosniff");
  if (options.cache !== false) {
    headers.set("Cache-Control", PUBLIC_API_CACHE_CONTROL);
    headers.set("CDN-Cache-Control", PUBLIC_API_CDN_CACHE_CONTROL);
  }
  return headers;
}

export function publicApiError(code: PublicApiErrorCode, message: string) {
  return {
    error: { code, message },
    meta: { api_version: PUBLIC_API_VERSION },
  };
}

export function encodePublicApiCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

export function decodePublicApiCursor(cursor: string | null): number | null {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const result = cursorSchema.safeParse(parsed);
    return result.success ? result.data.offset : null;
  } catch {
    return null;
  }
}

export function parsePublicApiLimit(value: string | null): number | null {
  if (value === null) return PUBLIC_API_DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= PUBLIC_API_MAX_LIMIT ? limit : null;
}

export function projectPublicApiSubstancePreview(article: PublicSubstancePreview) {
  return {
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    priority: article.priority,
    categories: article.indexCategories,
    url: `https://dose.wiki/${article.slug}`,
  };
}

export function projectPublicApiSubstanceDetail(article: PublicSubstanceRecord) {
  return {
    ...article,
    url: `https://dose.wiki/${article.slug}`,
  };
}
