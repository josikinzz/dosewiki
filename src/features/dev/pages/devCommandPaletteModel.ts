import { roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import { DEV_TAB_REGISTRY, type DevModeTab } from "./devTabRegistry";

export type PaletteTool = {
  tab: DevModeTab;
  label: string;
  href?: string;
  terms: readonly string[];
};

export type PaletteRecord = {
  key: string;
  tab: DevModeTab;
  title: string;
  detail?: string;
  href: string;
  terms: string;
  kind?: "view";
};

export type PaletteMatch = { tools: PaletteTool[]; views: PaletteRecord[]; records: PaletteRecord[] };

export function normalizePaletteText(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function words(value: string): string[] {
  return normalizePaletteText(value).split(/[^a-z0-9]+/).filter(Boolean);
}

export function recordTerms(...parts: readonly (string | null | undefined)[]): string {
  return normalizePaletteText(parts.filter(Boolean).join(" "));
}

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

export function matchPalette(
  query: string,
  tools: readonly PaletteTool[],
  entries: readonly PaletteRecord[],
  recordLimit = 20,
): PaletteMatch {
  const tokens = words(query);
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
