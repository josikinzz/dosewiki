import "server-only";

import { publicDataCache } from "../convex/publicData.cache";
import { cache } from "react";

import {
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
} from "../convex/publicData.cache";
import { getPublicDataReadAdapter } from "../convex/publicData.reads";
import { SITE_FLAVOR_CONFIG, type SiteFlavor } from "../../src/config/siteFlavor";
import {
  COPY_BLOCK_DEFAULTS,
  getCopyBlockDefault,
  type CopyBlockDefinition,
  type CopyBlockKind,
} from "../../src/data/content/copyBlocks";

/**
 * Server read for editable site copy.
 *
 * One Convex read serves every copy block on a page — the table is one row per
 * editable string — and it is `unstable_cache`d under
 * `PUBLIC_CONVEX_CACHE_TAGS.copy`, so the Copy Studio save route can make an
 * edit public immediately by revalidating that one tag.
 *
 * Resolution is always defaulted: `copy.get(key)` falls back to the checked-in
 * definition in `src/data/content/copyBlocks.json` whenever Convex holds no row
 * for the key. That makes an un-seeded (or un-deployed) environment render
 * exactly the prose the pages hardcoded, and makes deleting a block a revert
 * rather than a blank space.
 */

export const COPY_CACHE_TAG = PUBLIC_CONVEX_CACHE_TAGS.copy;

export type CopyBlockRecord = {
  key: string;
  flavor?: string;
  kind: CopyBlockKind;
  body?: string;
  items?: string[];
  label: string;
  group: string;
  updatedAt?: string;
  updatedBy?: string;
};

/** A resolved block plus where it came from, for the Copy Studio's diff well. */
export type ResolvedCopyBlock = CopyBlockRecord & {
  source: "convex" | "default";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseCopyBlockRecord(raw: unknown): CopyBlockRecord | null {
  if (!isRecord(raw)) {
    return null;
  }

  const kind = raw.kind;
  if (
    typeof raw.key !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.group !== "string" ||
    (kind !== "markdown" && kind !== "plain" && kind !== "list")
  ) {
    return null;
  }

  const record: CopyBlockRecord = {
    key: raw.key,
    kind,
    label: raw.label,
    group: raw.group,
  };

  if (typeof raw.flavor === "string" && raw.flavor.length > 0) record.flavor = raw.flavor;
  if (typeof raw.body === "string") record.body = raw.body;
  if (Array.isArray(raw.items)) {
    record.items = raw.items.filter((item): item is string => typeof item === "string");
  }
  if (typeof raw.updatedAt === "string") record.updatedAt = raw.updatedAt;
  if (typeof raw.updatedBy === "string") record.updatedBy = raw.updatedBy;

  return record;
}

/**
 * A deployment that predates `copyBlocks:getAll` — or a Convex read that fails
 * outright — must not take the page down over prose that has a checked-in
 * default sitting right here. It degrades to the defaults, loudly, because an
 * empty table and a missing function look identical on the rendered page.
 */
function reportDegradedCopyRead(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[copy] copyBlocks:getAll failed; site copy degraded to the checked-in defaults. Cause: ${message}`,
  );
}

export const getCopyBlocks = cache(
  publicDataCache(async (): Promise<CopyBlockRecord[]> => {
    try {
      const rows = await getPublicDataReadAdapter().getPublicCopyBlocks();
      if (!Array.isArray(rows)) {
        return [];
      }
      return rows.flatMap((row) => {
        const parsed = parseCopyBlockRecord(row);
        return parsed ? [parsed] : [];
      });
    } catch (error) {
      reportDegradedCopyRead(error);
      return [];
    }
  },
  ["convex-public-copy-blocks"],
  {
    revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.copy],
  },),
);

function toRecord(definition: CopyBlockDefinition): CopyBlockRecord {
  return {
    key: definition.key,
    flavor: definition.flavor,
    kind: definition.kind,
    body: definition.body,
    items: definition.items,
    label: definition.label,
    group: definition.group,
  };
}

export type CopyResolver = {
  /** The resolved block for a key, or null when neither Convex nor the defaults know it. */
  get(key: string): ResolvedCopyBlock | null;
  /** Body text for a `plain`/`markdown` block; "" when the key is unknown. */
  text(key: string): string;
  /** Items for a `list` block; [] when the key is unknown or holds no list. */
  items(key: string): string[];
  /** Every resolved block, Convex rows layered over the defaults. */
  all(): ResolvedCopyBlock[];
};

/**
 * Builds the resolver from an already-fetched row set. Exported so the Copy
 * Studio API route and tests can resolve without a second read.
 */
export function createCopyResolver(rows: readonly CopyBlockRecord[]): CopyResolver {
  const byKey = new Map<string, CopyBlockRecord>(rows.map((row) => [row.key, row]));

  const resolve = (key: string): ResolvedCopyBlock | null => {
    const stored = byKey.get(key);
    if (stored) {
      return { ...stored, source: "convex" };
    }
    const fallback = getCopyBlockDefault(key);
    return fallback ? { ...toRecord(fallback), source: "default" } : null;
  };

  return {
    get: resolve,
    text: (key) => resolve(key)?.body ?? "",
    items: (key) => resolve(key)?.items ?? [],
    all: () => {
      const keys = new Set<string>([
        ...COPY_BLOCK_DEFAULTS.map((definition) => definition.key),
        ...rows.map((row) => row.key),
      ]);
      return [...keys].flatMap((key) => {
        const resolved = resolve(key);
        return resolved ? [resolved] : [];
      });
    },
  };
}

/**
 * The page-level entry point: `const copy = await getCopy();` then
 * `copy.text("home-hero-tagline")`.
 */
export const getCopy = cache(async (): Promise<CopyResolver> => {
  return createCopyResolver(await getCopyBlocks());
});

/**
 * The key suffix a flavor's own rows carry.
 *
 * The defaults already encode this convention: the bare key holds dose.wiki's
 * wording (`footer-tagline`) and Effect Index's sits beside it under a suffixed
 * key (`footer-tagline-effect-index`). dose.wiki is the default flavor, so it
 * takes no suffix.
 */
const FLAVOR_KEY_SUFFIX: Record<SiteFlavor, string | null> = {
  dosewiki: null,
  effectindex: "effect-index",
};

/** The key the active flavor should read for a shared copy slot. */
export function flavoredCopyKey(
  key: string,
  flavor: SiteFlavor = SITE_FLAVOR_CONFIG.flavor,
): string {
  const suffix = FLAVOR_KEY_SUFFIX[flavor];
  return suffix ? `${key}-${suffix}` : key;
}

/**
 * Flavor-aware body read.
 *
 * Deliberately does NOT fall back from `key-effect-index` to the bare `key`:
 * the bare key holds dose.wiki's wording, and serving that on Effect Index
 * would misstate what the site is. A flavor with no row and no default of its
 * own keeps the caller's hardcoded string until its row is authored.
 */
export function flavoredCopyText(copy: CopyResolver, key: string, fallback: string): string {
  return copy.get(flavoredCopyKey(key))?.body ?? fallback;
}

/** Flavor-aware `list` read, with the same no-cross-flavor-fallback rule. */
export function flavoredCopyItems(
  copy: CopyResolver,
  key: string,
  fallback: readonly string[],
): string[] {
  const resolved = copy.get(flavoredCopyKey(key));
  return resolved?.items ?? [...fallback];
}
