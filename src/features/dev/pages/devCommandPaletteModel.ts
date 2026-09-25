/**
 * What the Cmd+K palette offers and how a query picks from it. Pure: the
 * palette component supplies the role and the loaded records.
 *
 * A query's first word may name a tool ("banners", "writing", or any of the
 * tool's route aliases and keywords); the rest then searches only that tool's
 * records, so "banners mdma" lands on MDMA in Banners. A query that names no
 * tool searches every record the role may open.
 *
 * Saved views are records of kind `view`: a queue opened on a repeated
 * workflow (oldest unresolved feedback, my pending proposals). They list on
 * an empty query, so the palette doubles as the launcher for them.
 */

import { roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import { DEV_TAB_REGISTRY, type DevModeTab } from "./devTabRegistry";

export type PaletteTool = {
  tab: DevModeTab;
  label: string;
  /** Set for a tool that opens outside the shell (Review). */
  href?: string;
  terms: readonly string[];
};

export type PaletteRecord = {
  /** Unique across every source. */
  key: string;
  tab: DevModeTab;
  title: string;
  /** A second line: the slug, the kind of record, an email. */
  detail?: string;
  /** Where the record opens, as an App Path. */
  href: string;
  /** Lowercased words the query matches against. */
  terms: string;
  /** `view`: a saved queue view rather than one record. */
  kind?: "view";
};

export type PaletteMatch = { tools: PaletteTool[]; views: PaletteRecord[]; records: PaletteRecord[] };

/** Lowercase, accents folded, so "MDMA" and "Méthylone" match plain typing. */
export function normalizePaletteText(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function words(value: string): string[] {
  return normalizePaletteText(value).split(/[^a-z0-9]+/).filter(Boolean);
}

/** The text a record matches on: its title, detail and any extra words. */
export function recordTerms(...parts: readonly (string | null | undefined)[]): string {
  return normalizePaletteText(parts.filter(Boolean).join(" "));
}

/**
 * Every tool the role may open, in rail order: the shell tools, Review and
 * the Change log. A tool above the role is left out entirely, not shown
 * locked; the rail is where locked tools explain themselves.
 */
export function paletteToolsFor(role: AppRole | null | undefined): PaletteTool[] {
  return DEV_TAB_REGISTRY.filter((tab) => roleMeetsFloor(role, tab.role)).map((tab) => {
    const label = tab.labelFor?.(role ?? null) ?? tab.label;
    const terms = new Set<string>([
      ...words(label),
      ...words(tab.label),
      normalizePaletteText(tab.id),
      ...words(tab.id),
      ...tab.aliases.flatMap((alias) => [normalizePaletteText(alias), ...words(alias)]),
      ...(tab.keywords ?? []).flatMap(words),
    ]);
    return {
      tab: tab.id,
      label,
      href: tab.destination.kind === "external" ? tab.destination.href : undefined,
      terms: [...terms],
    };
  });
}

function toolMatches(tool: PaletteTool, tokens: readonly string[]): boolean {
  return tokens.every((token) => tool.terms.some((term) => term.startsWith(token)));
}

function toolRank(tool: PaletteTool, query: string): number {
  const label = normalizePaletteText(tool.label);
  if (label === query || tool.tab === query) return 0;
  if (label.startsWith(query)) return 1;
  return 2;
}

function recordMatches(record: PaletteRecord, tokens: readonly string[]): boolean {
  return tokens.every((token) => record.terms.includes(token));
}

function recordRank(record: PaletteRecord, phrase: string): number {
  const title = normalizePaletteText(record.title);
  const detail = normalizePaletteText(record.detail ?? "");
  if (title === phrase || detail === phrase) return 0;
  if (title.startsWith(phrase) || detail.startsWith(phrase)) return 1;
  return 2;
}

function ranked(records: readonly PaletteRecord[], tokens: readonly string[]): PaletteRecord[] {
  const phrase = tokens.join(" ");
  return records
    .filter((record) => recordMatches(record, tokens))
    .map((record, index) => ({ record, index, rank: recordRank(record, phrase) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ record }) => record);
}

/**
 * The tools, saved views and records a query shows, best first. An empty
 * query lists every tool and every saved view, and no records. Records are
 * capped at `recordLimit` so a one-letter query never renders the whole
 * corpus.
 */
export function matchPalette(
  query: string,
  tools: readonly PaletteTool[],
  entries: readonly PaletteRecord[],
  recordLimit = 20,
): PaletteMatch {
  const tokens = words(query);
  // Records only for tools the role may open: `tools` is already role-filtered.
  const openable = new Set(tools.map((tool) => tool.tab));
  const views = entries.filter((entry) => entry.kind === "view" && openable.has(entry.tab));
  const records = entries.filter((entry) => entry.kind !== "view");
  if (tokens.length === 0) return { tools: [...tools], views, records: [] };

  const joined = tokens.join(" ");
  const matchedTools = tools
    .map((tool, index) => ({ tool, index }))
    .filter(({ tool }) => toolMatches(tool, tokens))
    .sort((a, b) => toolRank(a.tool, joined) - toolRank(b.tool, joined) || a.index - b.index)
    .map(({ tool }) => tool);

  const reachable = records.filter((record) => openable.has(record.tab));

  const scopedTabs = tokens.length > 1
    ? new Set(tools.filter((tool) => toolMatches(tool, tokens.slice(0, 1))).map((tool) => tool.tab))
    : new Set<DevModeTab>();
  const scoped = scopedTabs.size > 0
    ? ranked(reachable.filter((record) => scopedTabs.has(record.tab)), tokens.slice(1))
    : [];
  const everywhere = joined.length >= 2 ? ranked(reachable, tokens) : [];

  const seen = new Set<string>();
  const matchedRecords: PaletteRecord[] = [];
  for (const record of [...scoped, ...everywhere]) {
    if (seen.has(record.key)) continue;
    seen.add(record.key);
    matchedRecords.push(record);
    if (matchedRecords.length >= recordLimit) break;
  }
  return { tools: matchedTools, views: ranked(views, tokens), records: matchedRecords };
}
