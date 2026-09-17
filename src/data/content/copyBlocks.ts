import copyBlockDefaultsSource from "@content/copy-blocks/copyBlocks.json";

/**
 * Local defaults for the editable copy blocks.
 *
 * Every key that a public page reads has an entry here, holding the string that
 * page hardcoded before the copy CMS existed. This file is the fallback layer:
 * if Postgres holds no row for a key — an un-seeded deployment, a deleted block,
 * a Postgres read that degraded — the reader still sees the original copy.
 *
 * It is also the seed source (`scripts/seed/seed-copy-blocks.mjs` reads the same
 * JSON) and the Copy Studio's "reset to default" target, so the three surfaces
 * can never disagree about what "default" means.
 *
 * Keep this module free of server-only imports: the /dev Copy Studio imports it
 * in the browser.
 */

const COPY_BLOCK_KINDS = ["markdown", "plain", "list"] as const

export type CopyBlockKind = (typeof COPY_BLOCK_KINDS)[number];

export type CopyBlockDefinition = {
  /** Stable lookup id, kebab-case. Never change one in place — add a new key. */
  key: string;
  /** Site skin this block belongs to; absent means every flavor shares it. */
  flavor?: string;
  kind: CopyBlockKind;
  /** Authoritative payload for `markdown` and `plain` blocks. */
  body?: string;
  /** Authoritative payload for `list` blocks. */
  items?: string[];
  /** Editor-facing name shown in the Copy Studio rail. */
  label: string;
  /** Editor-facing rail grouping. */
  group: string;
};

function isCopyBlockKind(value: unknown): value is CopyBlockKind {
  return typeof value === "string" && (COPY_BLOCK_KINDS as readonly string[]).includes(value);
}

function parseCopyBlockDefinition(raw: unknown): CopyBlockDefinition | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (
    typeof record.key !== "string" ||
    typeof record.label !== "string" ||
    typeof record.group !== "string" ||
    !isCopyBlockKind(record.kind)
  ) {
    return null;
  }

  const definition: CopyBlockDefinition = {
    key: record.key,
    kind: record.kind,
    label: record.label,
    group: record.group,
  };

  if (typeof record.flavor === "string" && record.flavor.length > 0) {
    definition.flavor = record.flavor;
  }

  if (record.kind === "list") {
    definition.items = Array.isArray(record.items)
      ? record.items.filter((item): item is string => typeof item === "string")
      : [];
  } else {
    definition.body = typeof record.body === "string" ? record.body : "";
  }

  return definition;
}

export const COPY_BLOCK_DEFAULTS: readonly CopyBlockDefinition[] = Array.isArray(
  copyBlockDefaultsSource,
)
  ? (copyBlockDefaultsSource as unknown[]).flatMap((entry) => {
      const parsed = parseCopyBlockDefinition(entry);
      return parsed ? [parsed] : [];
    })
  : [];

const DEFAULTS_BY_KEY = new Map<string, CopyBlockDefinition>(
  COPY_BLOCK_DEFAULTS.map((definition) => [definition.key, definition]),
);

export function getCopyBlockDefault(key: string): CopyBlockDefinition | null {
  return DEFAULTS_BY_KEY.get(key) ?? null;
}

/** Rail groupings in the order the Copy Studio should present them. */

