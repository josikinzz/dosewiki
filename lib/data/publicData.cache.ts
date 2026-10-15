import { createHash, randomUUID } from "node:crypto";
import { unstable_cache } from "next/cache";
import { resolveRuntimePostgresTarget } from "../postgres/runtime/target";
import {
  PUBLIC_DATA_CACHE_TAGS,
  PUBLIC_SUBSTANCE_CONTENT_TAG,
  PUBLIC_SUBSTANCE_LISTS_TAG,
} from "./publicData.cacheTags";

export const PUBLIC_DATA_CACHE_REVALIDATE_SECONDS = 900;

const MAX_PUBLIC_CACHE_BYTES = 1_800_000;

let postgresTargetUrl: string | undefined;
let postgresTargetIdentity = "";

function getPostgresCacheTarget(): string {
  const { url } = resolveRuntimePostgresTarget();
  if (url !== postgresTargetUrl) {
    postgresTargetIdentity = `postgres:${createHash("sha256").update(url).digest("hex")}`;
    postgresTargetUrl = url;
  }
  return postgresTargetIdentity;
}

type PublicCachedValue<Result> =
  | { cacheable: true; value: Result }
  | { cacheable: false };

export function publicDataCache<Args extends unknown[], Result>(
  callback: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: {
    revalidate?: number | false;
    tags?: string[] | ((...args: Args) => string[]);
    awaitRefresh?: boolean;
  },
): (...args: Args) => Promise<Result> {
  const callbackKey = callback.toString();
  const { awaitRefresh, ...cacheOptions } = options;
  return async (...args) => {
    const target = getPostgresCacheTarget();
    const tags = typeof options.tags === "function" ? options.tags(...args) : options.tags;
    let currentRead: Promise<Result> | undefined;
    const cached = await unstable_cache(async (...values: Args): Promise<PublicCachedValue<Result>> => {
      const result = await (currentRead ??= callback(...values));
      const entry = { cacheable: true as const, value: result };
      const body = JSON.stringify(entry);
      if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_PUBLIC_CACHE_BYTES) {
        return { cacheable: false };
      }
      return entry;
    }, [...keyParts, target, callbackKey], { ...cacheOptions, tags })(...args);
    if (awaitRefresh && cached.cacheable && currentRead) {
      await currentRead.catch(() => undefined);
    }
    if (cached.cacheable) return cached.value;
    return currentRead ??= callback(...args);
  };
}

export type PublicDerivedCacheIdentity = "library" | "search";

const getPublicLibraryRevision = publicDataCache(
  async () => randomUUID(),
  ["data-public-derived-library-revision-v2"],
  {
    revalidate: false,
    tags: [
      PUBLIC_DATA_CACHE_TAGS.all,
      PUBLIC_SUBSTANCE_CONTENT_TAG,
      PUBLIC_SUBSTANCE_LISTS_TAG,
      PUBLIC_DATA_CACHE_TAGS.layouts,
    ],
  },
);

const getPublicSearchRevision = publicDataCache(
  async () => randomUUID(),
  ["data-public-derived-search-revision-v2"],
  {
    revalidate: false,
    tags: [
      PUBLIC_DATA_CACHE_TAGS.all,
      PUBLIC_SUBSTANCE_CONTENT_TAG,
      PUBLIC_SUBSTANCE_LISTS_TAG,
      PUBLIC_DATA_CACHE_TAGS.layouts,
      PUBLIC_DATA_CACHE_TAGS.effects,
      PUBLIC_DATA_CACHE_TAGS.reports,
      PUBLIC_DATA_CACHE_TAGS.contributors,
    ],
  },
);

export async function getPublicDerivedCacheIdentity(
  identity: PublicDerivedCacheIdentity,
): Promise<string> {
  return identity === "library"
    ? getPublicLibraryRevision()
    : getPublicSearchRevision();
}
