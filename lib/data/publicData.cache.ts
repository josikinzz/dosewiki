import { createHash, randomUUID } from "node:crypto";
import { unstable_cache } from "next/cache";
import { resolveRuntimePostgresTarget } from "../postgres/runtime/target";

export const PUBLIC_DATA_CACHE_REVALIDATE_SECONDS = 900;

export const PUBLIC_DATA_CACHE_TAGS = {
  all: "data-public",
  substances: "data-public:substances",
  reagentTests: "data-public:reagent-tests",
  effects: "data-public:effects",
  articles: "data-public:articles",
  blog: "data-public:blog",
  replications: "data-public:replications",
  reports: "data-public:reports",
  contributors: "data-public:contributors",
  changelog: "data-public:changelog",
  featuredReplications: "data-public:featured-replications",
  about: "data-public:about",
  layouts: "data-public:layouts",
  copy: "data-public:copy",
  molecules: "data-public:molecules",
  banners: "data-public:banners",
} as const;

export const publicSubstanceTag = (slug: string) => `${PUBLIC_DATA_CACHE_TAGS.substances}:${slug}`;
export const publicSubstanceGalleryTag = (slug: string) => `${PUBLIC_DATA_CACHE_TAGS.replications}:substance:${slug}`;
export const publicArticleHistoryTag = (slug: string) => `${PUBLIC_DATA_CACHE_TAGS.changelog}:article:${slug}`;
export const publicEffectTag = (slug: string) => `${PUBLIC_DATA_CACHE_TAGS.effects}:${slug}`;
export const publicMoleculeTag = (slug: string) => `${PUBLIC_DATA_CACHE_TAGS.molecules}:${slug}`;
export const PUBLIC_SUBSTANCE_LISTS_TAG = "data-public:substance-lists";
export const PUBLIC_SUBSTANCE_CONTENT_TAG = "data-public:substance-content";
export const PUBLIC_SUBSTANCE_DOCUMENTS_TAG = "data-public:substance-documents";
export const PUBLIC_CHANGELOG_LISTS_TAG = "data-public:changelog-lists";

// Next stores the result as a JSON string inside its fetch-cache envelope.
// Measure the escaped body, leaving headroom below 2 MB for its fixed metadata.
const MAX_PUBLIC_CACHE_BYTES = 1_800_000;

let postgresTargetUrl: string | undefined;
let postgresTargetIdentity = "";

function getPostgresCacheTarget(): string {
  const { url } = resolveRuntimePostgresTarget();
  if (url !== postgresTargetUrl) {
    // Next includes cache keys in revalidation errors. Never put credentials there.
    postgresTargetIdentity = `postgres:${createHash("sha256").update(url).digest("hex")}`;
    postgresTargetUrl = url;
  }
  return postgresTargetIdentity;
}

type PublicCachedValue<Result> =
  | { cacheable: true; value: Result }
  | { cacheable: false };

/**
 * One persistent leaf, namespaced by the same read target as serverClient.
 * Resolve the target at invocation, not module load, so a target change cannot
 * reuse an old deployment's data. Compositions must remain React cache only.
 * Oversized values persist only a bounded bypass sentinel. A successful
 * background refresh must replace the old value, not throw and keep stale data.
 */
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
    // Backend identity is part of the namespace: a Postgres-served process never reuses Postgres-tagged entries.
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
      // A stale page returns immediately from Next while its refresh runs.
      // Wait before advancing the cursor, preserving Next's stale-on-error
      // behavior and leaving refresh error reporting to Next itself.
      await currentRead.catch(() => undefined);
    }
    if (cached.cacheable) return cached.value;
    // Share this invocation's read with background refresh too. A sentinel hit
    // always resolves current content, never the former oversized cache value.
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

/**
 * Cross-instance identity for process-resident derived caches. Publication tag
 * expiry makes the next request obtain one new shared token from Next's cache.
 */
export async function getPublicDerivedCacheIdentity(
  identity: PublicDerivedCacheIdentity,
): Promise<string> {
  return identity === "library"
    ? getPublicLibraryRevision()
    : getPublicSearchRevision();
}
