import "server-only";

import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "../data/publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS } from "../data/publicData.cacheTags";
import { cache } from "react";

import { getPublicDataReadAdapter } from "../data/publicData.reads";
import { SITE_FLAVOR_CONFIG, type SiteFlavor } from "../../src/config/siteFlavor";
import {
  COPY_BLOCK_DEFAULTS,
  getCopyBlockDefault,
  type CopyBlockDefinition,
  type CopyBlockKind,
} from "../../src/data/content/copyBlocks";

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

function reportDegradedCopyRead(error: unknown, operation = "copyBlocks:getAll"): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[copy] ${operation} failed; site copy degraded to the checked-in defaults. Cause: ${message}`,
  );
}

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

export const getCopyByKeys = cache(async (keys: readonly string[]): Promise<CopyResolver> => {
  const normalizedKeys = [...new Set(keys)].sort();
  return createCopyResolver(await getCopyBlocksByKeysCached(normalizedKeys));
});

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
  get(key: string): ResolvedCopyBlock | null;
  text(key: string): string;
  items(key: string): string[];
  all(): ResolvedCopyBlock[];
};

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

const FLAVOR_KEY_SUFFIX: Record<SiteFlavor, string | null> = {
  dosewiki: null,
  effectindex: "effect-index",
};

export function flavoredCopyKey(
  key: string,
  flavor: SiteFlavor = SITE_FLAVOR_CONFIG.flavor,
): string {
  const suffix = FLAVOR_KEY_SUFFIX[flavor];
  return suffix ? `${key}-${suffix}` : key;
}

export function flavoredCopyText(copy: CopyResolver, key: string, fallback: string): string {
  return copy.get(flavoredCopyKey(key))?.body ?? fallback;
}

