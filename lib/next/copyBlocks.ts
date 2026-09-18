import "server-only";

import { publicDataCache } from "../data/publicData.cache";
import { cache } from "react";

import {
  PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  PUBLIC_DATA_CACHE_TAGS,
} from "../data/publicData.cache";
import { getPublicDataReadAdapter } from "../data/publicData.reads";
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
 * One Postgres read serves every copy block on a page — the table is one row per
 * editable string — and it is `unstable_cache`d under
 * `PUBLIC_DATA_CACHE_TAGS.copy`, so the Copy Studio save route can make an
 * edit public immediately by revalidating that one tag.
 *
 * Resolution is always defaulted: `copy.get(key)` falls back to the checked-in
 * definition in `content/copy-blocks/copyBlocks.json` whenever Postgres holds no row
 * for the key. That makes an un-seeded (or un-deployed) environment render
 * exactly the prose the pages hardcoded, and makes deleting a block a revert
 * rather than a blank space.
 */


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
type ResolvedCopyBlock = CopyBlockRecord & {
  source: "data" | "default";
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
 * A deployment that predates `copyBlocks:getAll` — or a Postgres read that fails
 * outright — must not take the page down over prose that has a checked-in
 * default sitting right here. It degrades to the defaults, loudly, because an
 * empty table and a missing function look identical on the rendered page.
 */
function reportDegradedCopyRead(error: unknown, operation = "copyBlocks:getAll"): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[copy] ${operation} failed; site copy degraded to the checked-in defaults. Cause: ${message}`,
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
  ["data-public-copy-blocks"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.copy],
  },),
);

const getCopyBlocksByKeysCached = publicDataCache(
  async (keys: string[]): Promise<CopyBlockRecord[]> => {
    try {
      const rows = await getPublicDataReadAdapter().getPublicCopyBlocksByKeys(keys);
      if (!Array.isArray(rows)) {
        return [];
      }
      return rows.flatMap((row) => {
        const parsed = parseCopyBlockRecord(row);
        return parsed ? [parsed] : [];
      });
    } catch (error) {
      reportDegradedCopyRead(error, "copyBlocks:getByKeys");
      return [];
    }
  },
  ["data-public-copy-blocks-by-keys"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.copy],
  },
);

/** Resolve a bounded set of public copy keys in one database read. */
export const getCopyByKeys = cache(async (keys: readonly string[]): Promise<CopyResolver> => {
  const normalizedKeys = [...new Set(keys)].sort();
  return createCopyResolver(await getCopyBlocksByKeysCached(normalizedKeys));
});

/** Checked-in keys in a copy namespace, for bounded family-level reads. */
export function getCopyKeysByPrefix(prefix: string): string[] {
  return COPY_BLOCK_DEFAULTS.flatMap((definition) =>
    definition.key.startsWith(prefix) ? [definition.key] : [],
  );
}

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
  /** The resolved block for a key, or null when neither Postgres nor the defaults know it. */
  get(key: string): ResolvedCopyBlock | null;
  /** Body text for a `plain`/`markdown` block; "" when the key is unknown. */
  text(key: string): string;
  /** Items for a `list` block; [] when the key is unknown or holds no list. */
  items(key: string): string[];
  /** Every resolved block, Postgres rows layered over the defaults. */
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
      return { ...stored, source: "data" };
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

