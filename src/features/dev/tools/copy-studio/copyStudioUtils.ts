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

/**
 * Rail groups in default order, with the blocks belonging to each. A flavored
 * block (`footer-tagline-effect-index`) is listed straight after the block it
 * rewords (`footer-tagline`) when both sit in the group, so the two wordings
 * read as a pair instead of landing rows apart.
 */
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

  return groups.map((entry) => ({ group: entry.group, blocks: pairFlavoredBlocks(entry.blocks) }));
}

/** The key a flavored block rewords: `footer-tagline-effect-index` rewords `footer-tagline`. */
export function copyBlockBaseKey(block: Pick<CopyStudioBlock, "key" | "flavor">): string | null {
  if (!block.flavor) return null;
  const suffix = `-${block.flavor}`;
  return block.key.endsWith(suffix) ? block.key.slice(0, -suffix.length) : null;
}

function pairFlavoredBlocks(blocks: readonly CopyStudioBlock[]): CopyStudioBlock[] {
  const keys = new Set(blocks.map((block) => block.key));
  const twins = new Map<string, CopyStudioBlock[]>();
  blocks.forEach((block) => {
    const base = copyBlockBaseKey(block);
    if (base && keys.has(base)) twins.set(base, [...(twins.get(base) ?? []), block]);
  });
  const paired = new Set([...twins.values()].flat().map((block) => block.key));
  return blocks.flatMap((block) => (paired.has(block.key) ? [] : [block, ...(twins.get(block.key) ?? [])]));
}

/**
 * The other wording of the same words: the Effect Index twin of a dose.wiki
 * block, or the dose.wiki block a flavored one rewords. Null when there is none.
 */
export function copyBlockTwin(
  block: Pick<CopyStudioBlock, "key" | "flavor">,
  blocks: readonly CopyStudioBlock[],
): CopyStudioBlock | null {
  const base = copyBlockBaseKey(block);
  if (base) return blocks.find((entry) => entry.key === base) ?? null;
  return blocks.find((entry) => entry.flavor && copyBlockBaseKey(entry) === block.key) ?? null;
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
 * The blocks whose key, label or published text contains `query`,
 * case-insensitively, so an editor can find a typo by the words they saw on
 * the page. Key and label matches come first, then text matches, each in
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
  const byName: CopyStudioBlock[] = [];
  const byText: CopyStudioBlock[] = [];
  blocks.forEach((block) => {
    const match = copySearchMatch(block, needle);
    if (match === "name") byName.push(block);
    else if (match) byText.push(block);
  });
  return [...byName, ...byText];
}

/**
 * Where `query` matched a block: its key or label, the words it shows, or,
 * for a stored block the compact catalogue lists without its text, the
 * checked-in default it started from. Null when it does not match.
 */
export type CopySearchMatch = "name" | "text" | "default";

export function copySearchMatch(block: CopyStudioBlock, query: string): CopySearchMatch | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  if (block.key.toLowerCase().includes(needle) || block.label.toLowerCase().includes(needle)) return "name";
  const text = blockCurrentText(block);
  if (text.toLowerCase().includes(needle)) return "text";
  if (!text && block.source === "data" && block.fallback) {
    const fallback = draftToText(block.kind, block.fallback);
    if (fallback.toLowerCase().includes(needle)) return "default";
  }
  return null;
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
  siteName: "dose.wiki",
  reviewer: "Jordan Lee",
  discordInvite: "https://discord.gg/example",
};

/**
 * What a draft does to the placeholders the published text relies on: names
 * the draft dropped (the page will stop filling them in) and names it added
 * that the published text never used (the page may print them as typed).
 */
export function placeholderChanges(published: string, draft: string): { removed: string[]; added: string[] } {
  const before = new Set(countPlaceholders(published).map((entry) => entry.name));
  const after = new Set(countPlaceholders(draft).map((entry) => entry.name));
  return {
    removed: [...before].filter((name) => !after.has(name)).sort(),
    added: [...after].filter((name) => !before.has(name)).sort(),
  };
}

/** The sections a block list is split into, with how many blocks each holds. */
export function countSectionBlocks(section: CopyStudioSection): number {
  return section.groups.reduce((total, group) => total + group.blocks.length, 0);
}

/** One line on what is stored for a block, for the pane header and the default wording block. */
export function describeCopySource(block: Pick<CopyStudioBlock, "source" | "fallback">): string {
  if (block.source === "default") return "Shows its checked-in default. Nothing is stored for it.";
  if (!block.fallback) return "Stored copy with no checked-in default, so there is nothing to go back to.";
  return "Shows stored copy. Its checked-in default is kept to go back to.";
}

/** The part of a `GET /api/dev/proposals` row Copy reads. */
export type CopyProposalRow = {
  _id: string;
  proposerName?: string;
  isAuthor?: boolean;
  status: string;
  createdAt?: string;
  targets?: readonly { kind: string; key: string }[];
};

export type OpenCopyProposal = { id: string; mine: boolean; by: string };

/**
 * The copy blocks an open proposal (submitted, or sent back for changes)
 * would change, keyed by block, newest proposal first. An editor's list holds
 * only their own proposals; an admin's holds everyone's.
 */
export function openCopyProposals(rows: readonly CopyProposalRow[]): Map<string, OpenCopyProposal> {
  const open = new Map<string, OpenCopyProposal>();
  [...rows]
    .filter((row) => row.status === "submitted" || row.status === "changes_requested")
    .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))
    .forEach((row) => {
      (row.targets ?? []).forEach((target) => {
        if (target.kind !== "copyBlock" || open.has(target.key)) return;
        open.set(target.key, { id: row._id, mine: Boolean(row.isAuthor), by: row.proposerName?.trim() || "Someone" });
      });
    });
  return open;
}

/** Text a search result or a browser tab cuts short: SEO titles and descriptions. */
export function copyLengthGuide(block: Pick<CopyStudioBlock, "key" | "group" | "kind">): { target: number; where: string } | undefined {
  if (block.group !== "SEO" || block.kind === "list") return undefined;
  return /title/.test(block.key)
    ? { target: 60, where: "search results and tabs" }
    : { target: 155, where: "search results" };
}
