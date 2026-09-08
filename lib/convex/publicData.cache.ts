import { unstable_cache } from "next/cache";
import { getPublicServerReadTarget } from "./runtimeTargets";

export const PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS = 900;

export const PUBLIC_CONVEX_CACHE_TAGS = {
  all: "convex-public",
  substances: "convex-public:substances",
  reagentTests: "convex-public:reagent-tests",
  effects: "convex-public:effects",
  articles: "convex-public:articles",
  blog: "convex-public:blog",
  replications: "convex-public:replications",
  reports: "convex-public:reports",
  contributors: "convex-public:contributors",
  changelog: "convex-public:changelog",
  featuredReplications: "convex-public:featured-replications",
  about: "convex-public:about",
  layouts: "convex-public:layouts",
  copy: "convex-public:copy",
  molecules: "convex-public:molecules",
  banners: "convex-public:banners",
} as const;

export const publicSubstanceTag = (slug: string) => `${PUBLIC_CONVEX_CACHE_TAGS.substances}:${slug}`;
export const publicSubstanceGalleryTag = (slug: string) => `${PUBLIC_CONVEX_CACHE_TAGS.replications}:substance:${slug}`;
export const publicArticleHistoryTag = (slug: string) => `${PUBLIC_CONVEX_CACHE_TAGS.changelog}:article:${slug}`;
export const publicEffectTag = (slug: string) => `${PUBLIC_CONVEX_CACHE_TAGS.effects}:${slug}`;
export const publicMoleculeTag = (slug: string) => `${PUBLIC_CONVEX_CACHE_TAGS.molecules}:${slug}`;
export const PUBLIC_SUBSTANCE_LISTS_TAG = "convex-public:substance-lists";
export const PUBLIC_CHANGELOG_LISTS_TAG = "convex-public:changelog-lists";

// Next stores the result as a JSON string inside its fetch-cache envelope.
// Measure the escaped body, leaving headroom below 2 MB for its fixed metadata.
const MAX_PUBLIC_CACHE_BYTES = 1_800_000;

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
  },
): (...args: Args) => Promise<Result> {
  const callbackKey = callback.toString();
  return async (...args) => {
    const target = getPublicServerReadTarget().selectedUrl ?? "unconfigured";
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
    }, [...keyParts, target, callbackKey], { ...options, tags })(...args);
    if (cached.cacheable) return cached.value;
    // Share this invocation's read with background refresh too. A sentinel hit
    // always resolves current content, never the former oversized cache value.
    return currentRead ??= callback(...args);
  };
}
