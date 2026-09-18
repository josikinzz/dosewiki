export type WarmCacheStatus = "hit" | "miss" | "unknown";

export type WarmRepresentation = "html" | "navigation";

export type WarmRepresentationReceipt = {
  representation: WarmRepresentation;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  bytes: number;
  cache: WarmCacheStatus;
  cacheHeader: string | null;
  attempts: number;
  durationMs: number;
  error: string | null;
};

export type WarmResult = {
  url: string;
  ok: boolean;
  durationMs: number;
  representations: Record<WarmRepresentation, WarmRepresentationReceipt>;
  error: string | null;
};

export type WarmSummary = {
  count: number;
  ok: number;
  failed: number;
  failureRate: number;
  representations: Record<
    WarmRepresentation,
    {
      ok: number;
      failed: number;
      meanMs: number;
      maxMs: number;
    }
  >;
  hits: number;
  misses: number;
  unknown: number;
  slowest: Array<{
    url: string;
    representation: WarmRepresentation;
    durationMs: number;
    cache: WarmCacheStatus;
    status: number | null;
  }>;
  failures: Array<{
    url: string;
    representation: WarmRepresentation;
    status: number | null;
    error: string | null;
  }>;
  remaining: number;
  meanMs: number;
  maxMs: number;
  totalMs: number;
};

export type WarmOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  now?: () => number;
  concurrency?: number;
  deadlineAt?: number | null;
};

export const NON_SUBSTANCE_ROOT_SEGMENTS: Set<string>;
export function parseSitemapLocations(xml: string): string[];
export function isSitemapIndex(xml: string): boolean;
export function isSubstanceArticleUrl(
  url: string,
  baseUrl?: string | null,
): boolean;
export function classifyCacheHeaders(
  headers: Headers | Record<string, string> | null | undefined,
): { status: WarmCacheStatus; raw: string | null };
export function runWithConcurrency<T, R>(
  items: Iterable<T>,
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<R | { error: unknown }>>;
export function warmUrl(
  url: string,
  options?: WarmOptions,
): Promise<WarmResult>;
export function warmUrls(
  urls: Iterable<string>,
  options?: WarmOptions,
): Promise<{ results: WarmResult[]; remaining: string[] }>;
export function summarizeWarmResults(
  results: Iterable<WarmResult>,
  options?: { slowest?: number; totalMs?: number | null; remaining?: string[] },
): WarmSummary;
export function formatWarmSummary(summary: WarmSummary): string;
export function parseWarmArgs(
  argv: Iterable<string>,
  env?: Record<string, string | undefined>,
): {
  baseUrl: string | null;
  all: boolean;
  concurrency: number;
  timeoutMs: number;
  maxFailurePercent: number;
  slowest: number;
  help: boolean;
};
export function collectSitemapUrls(
  baseUrl: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<{ sitemapUrl: string; urls: string[] }>;
export function selectWarmUrls(
  urls: Iterable<string>,
  options: { baseUrl?: string | null; all?: boolean },
): string[];
