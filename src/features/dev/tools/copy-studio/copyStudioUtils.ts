import {
  COPY_BLOCK_DEFAULTS,
  getCopyBlockDefault,
  type CopyBlockDefinition,
  type CopyBlockKind,
} from "@/data/content/copyBlocks";

/**
 * Pure state for the Copy Studio: how a stored row, a local default, and the
 * editor's draft are reconciled into one editable block.
 *
 * Kept free of React so the reconciliation (which decides what "changed",
 * what "reset" means, and which placeholders a draft carries) is testable
 * without rendering the tab.
 */

/** Mirrors the About editor's placeholder syntax: `{{ someKey }}`. */
const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

/** A stored `copyBlocks` row, as the Postgres query returns it. */
export type CopyBlockRow = {
  key: string;
  flavor?: string;
  kind: CopyBlockKind;
  body?: string;
  items?: string[];
  label: string;
  group: string;
  updatedAt?: string;
  updatedBy?: string;
  revision?: number;
};

/** One block as the studio presents it: default, stored row, and draft in one. */
export type CopyStudioBlock = {
  key: string;
  flavor?: string;
  kind: CopyBlockKind;
  label: string;
  group: string;
  /** The published value: the stored row when there is one, else the default. */
  current: { body: string; items: string[] };
  /** The checked-in fallback, and the target of "reset to default". */
  fallback: { body: string; items: string[] } | null;
  /** Where `current` came from. A "default" block has never been saved. */
  source: "data" | "default";
  updatedAt?: string;
  updatedBy?: string;
};

export type CopyStudioDraft = {
  body: string;
  items: string[];
};

function payloadOf(source: {
  body?: string;
  items?: string[];
}): CopyStudioDraft {
  return {
    body: typeof source.body === "string" ? source.body : "",
    items: Array.isArray(source.items) ? [...source.items] : [],
  };
}

function fromDefinition(definition: CopyBlockDefinition): CopyStudioBlock {
  return {
    key: definition.key,
    flavor: definition.flavor,
    kind: definition.kind,
    label: definition.label,
    group: definition.group,
    current: payloadOf(definition),
    fallback: payloadOf(definition),
    source: "default",
  };
}

/**
 * Layers the stored rows over the checked-in defaults.
 *
 * A key present in both is one block whose `current` is the stored value and
 * whose `fallback` is the default. A stored key with no default still appears,
 * since a block added straight in Postgres is editable, but has no reset target.
 */
export function buildCopyStudioBlocks(rows: readonly CopyBlockRow[]): CopyStudioBlock[] {
  const byKey = new Map<string, CopyStudioBlock>(
    COPY_BLOCK_DEFAULTS.map((definition) => [definition.key, fromDefinition(definition)]),
  );

  rows.forEach((row) => {
    const definition = getCopyBlockDefault(row.key);
    byKey.set(row.key, {
      key: row.key,
      flavor: row.flavor ?? definition?.flavor,
      // The checked-in definition owns the renderer contract. A stored row
      // contributes content, but cannot pin a block to an obsolete kind after
      // code migrates it from plain text to Markdown.
      kind: definition?.kind ?? row.kind,
      label: row.label,
      group: row.group,
      current: payloadOf(row),
      fallback: definition ? payloadOf(definition) : null,
      source: "data",
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    });
  });

  return [...byKey.values()];
}

export type CopyStudioGroup = { group: string; blocks: CopyStudioBlock[] };

export type CopyStudioSection = { section: string; groups: CopyStudioGroup[] };

/** Rail groups in default order, with the blocks belonging to each. */
export function groupCopyStudioBlocks(blocks: readonly CopyStudioBlock[]): CopyStudioGroup[] {
  const groups: CopyStudioGroup[] = [];

  blocks.forEach((block) => {
    const existing = groups.find((entry) => entry.group === block.group);
    if (existing) {
      existing.blocks.push(block);
      return;
    }
    groups.push({ group: block.group, blocks: [block] });
  });

  return groups;
}

/**
 * The tier above the rail groups, so the group chips never wrap: an editor
 * picks the part of the site first and then one of that part's few groups.
 * A group no section claims is listed under "Other" rather than dropped.
 */
const COPY_STUDIO_SECTIONS: readonly { section: string; groups: readonly string[] }[] = [
  {
    section: "Site",
    groups: [
      "Home",
      "Footer",
      "About",
      "Effect Index",
      "Submissions",
      "Status pages",
      "Support pages",
      "Empty states",
      "Replications",
      "China",
    ],
  },
  { section: "Substances", groups: ["Substance categories", "Substance articles"] },
  { section: "Effects", groups: ["Index pages", "Subjective Effect Index", "Effect categories"] },
  { section: "Docs", groups: ["Docs · Code", "Docs · How", "Docs · License"] },
  { section: "SEO", groups: ["SEO"] },
];

/** Sections in display order, each holding only the groups that have blocks. */
export function sectionCopyStudioGroups(groups: readonly CopyStudioGroup[]): CopyStudioSection[] {
  const claimed = new Set<string>();
  const sections: CopyStudioSection[] = [];

  COPY_STUDIO_SECTIONS.forEach((definition) => {
    const members = definition.groups
      .map((name) => groups.find((entry) => entry.group === name))
      .filter((entry): entry is CopyStudioGroup => entry !== undefined);
    members.forEach((entry) => claimed.add(entry.group));
    if (members.length > 0) {
      sections.push({ section: definition.section, groups: members });
    }
  });

  const unclaimed = groups.filter((entry) => !claimed.has(entry.group));
  if (unclaimed.length > 0) {
    sections.push({ section: "Other", groups: unclaimed });
  }

  return sections;
}

/**
 * The blocks whose key or label contains `query`, case-insensitively, in
 * catalogue order. A blank query matches nothing: the rail shows the active
 * group instead, so the search never has to enumerate all 400-odd blocks.
 */
export function filterCopyStudioBlocks(
  blocks: readonly CopyStudioBlock[],
  query: string,
): CopyStudioBlock[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return blocks.filter(
    (block) =>
      block.key.toLowerCase().includes(needle) || block.label.toLowerCase().includes(needle),
  );
}

/**
 * Publication label for a flavored block.
 *
 * A flavor row is just a key: `footer-tagline-effect-index` sits in the same
 * "Footer" group as dose.wiki's `footer-tagline`, which is what makes the pair
 * comparable, so the studio has to say out loud which publication a row is
 * rendered on. Only the flavored rows carry a label; an unflavored row is the
 * default publication's and needs no badge.
 *
 * The keys match `copyBlocks.json`'s `flavor` field, which is the key suffix
 * (`effect-index`), not the `SiteFlavor` id (`effectindex`).
 */
const COPY_FLAVOR_LABELS: Record<string, string> = {
  "effect-index": "Effect Index",
};

export function copyBlockFlavorLabel(flavor?: string): string | null {
  if (!flavor) {
    return null;
  }
  return COPY_FLAVOR_LABELS[flavor] ?? flavor;
}

export function draftFromBlock(block: CopyStudioBlock): CopyStudioDraft {
  return { body: block.current.body, items: [...block.current.items] };
}

/** List drafts drop blank trailing rows so an empty editor row is not a change. */
function normalizeItems(items: readonly string[]): string[] {
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

export function isDraftDirty(block: CopyStudioBlock, draft: CopyStudioDraft): boolean {
  if (block.kind === "list") {
    const next = normalizeItems(draft.items);
    const current = normalizeItems(block.current.items);
    return next.length !== current.length || next.some((item, index) => item !== current[index]);
  }

  return draft.body !== block.current.body;
}

/** True when the block has a checked-in default that differs from the draft. */
export function canResetToDefault(block: CopyStudioBlock, draft: CopyStudioDraft): boolean {
  if (!block.fallback) {
    return false;
  }

  if (block.kind === "list") {
    const next = normalizeItems(draft.items);
    const fallback = normalizeItems(block.fallback.items);
    return next.length !== fallback.length || next.some((item, index) => item !== fallback[index]);
  }

  return draft.body !== block.fallback.body;
}

/** Text used for the diff well and the markdown preview. */
export function draftToText(kind: CopyBlockKind, draft: CopyStudioDraft): string {
  return kind === "list"
    ? draft.items.map((item) => `- ${item}`).join("\n")
    : draft.body;
}

export function blockCurrentText(block: CopyStudioBlock): string {
  return draftToText(block.kind, block.current);
}

export type PlaceholderCount = { name: string; count: number };

/**
 * The placeholders a draft carries, with how many times each appears. Shown
 * live while typing so an editor can see at a glance that they have not dropped
 * (or doubled) an interpolated value the page supplies.
 */
export function countPlaceholders(value: string): PlaceholderCount[] {
  const counts = new Map<string, number>();

  for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1].trim();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Substitutes placeholder values for the preview only. Mirrors
 * `resolveAboutPlaceholders`: an unknown placeholder is left visible rather
 * than blanked, so a typo in a placeholder name shows up in the preview.
 */
export function resolveCopyPlaceholders(
  value: string,
  placeholderValues: Record<string, string>,
): string {
  if (!value) {
    return "";
  }

  return value.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    return placeholderValues[name.trim()] ?? match;
  });
}

/**
 * Stand-in values for the preview. These are illustrative only (the real
 * numbers are supplied by whichever page reads the block), but a preview that
 * renders "{{effectCount}} effect descriptions" reads as broken prose, so the
 * studio shows a plausible figure instead.
 */
export const COPY_PREVIEW_PLACEHOLDER_VALUES: Record<string, string> = {
  effectCount: "244",
  substanceCount: "312",
  categoryCount: "9",
  reportCount: "180",
  replicationCount: "95",
};
