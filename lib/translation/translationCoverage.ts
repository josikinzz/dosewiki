/** Source-derived coverage. Queue completion and stored translations never prove publication. */
import "server-only";

import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { glossaryTermPattern, kindInContext } from "../../scripts/translation/locales.mjs";
import { findLeftoverLatin, findRepeatedPunctuation } from "../../scripts/translation/validate.mjs";
import {
  publicRecords, segmentsOf, workUnitsOf, TRANSLATION_RECORD_KINDS,
  type TranslationContext, type TranslationRecordKind,
} from "./liveTranslation";
import {
  readTranslationCoverageRows, readTranslationRejections, translationQueueCoverage,
  type TranslationRejectionRow,
} from "./segmentStore";
import type { CoverageCounts, TranslationCoverageResponse, TranslationQueueCoverage } from "./translationCoverageTypes";

export type CoverageSourceRecord = {
  kind: TranslationRecordKind;
  slug: string;
  units: Array<{ hash: string; source: string }>;
};
export type CoverageInventory = { generatedAt: number; records: CoverageSourceRecord[] };
export type CoverageStoredUnit = { hash: string; target: string; prompt_version: string };
const INVENTORY_TTL_MS = 5 * 60_000;
const MAX_INVENTORY_UNITS = 500_000;
const PAGES_LIMIT = 200;
const inventoryCache = new WeakMap<PublicDataReadAdapter, { value?: CoverageInventory; pending?: Promise<CoverageInventory> }>();

/** Called on explicit coverage inspection, not the glossary list/typing path. */
export async function buildCoverageInventory(reads: PublicDataReadAdapter): Promise<CoverageInventory> {
  const records: CoverageSourceRecord[] = [];
  let units = 0;
  for (const kind of TRANSLATION_RECORD_KINDS) {
    for (const source of await publicRecords(reads, kind)) {
      const recordUnits = workUnitsOf(segmentsOf(source, kind), kind).map(({ hash, source: text }) => ({ hash, source: text }));
      units += recordUnits.length;
      if (units > MAX_INVENTORY_UNITS) throw new Error("Translation inventory exceeds the interactive audit limit. Run the offline coverage audit.");
      records.push({ kind, slug: source.slug, units: recordUnits });
    }
  }
  return { generatedAt: Date.now(), records };
}

/** Five-minute bounded freshness; concurrent requests share one source traversal. */
export async function getCoverageInventory(reads: PublicDataReadAdapter): Promise<CoverageInventory> {
  let entry = inventoryCache.get(reads);
  if (!entry) { entry = {}; inventoryCache.set(reads, entry); }
  if (entry.value && Date.now() - entry.value.generatedAt < INVENTORY_TTL_MS) return entry.value;
  if (!entry.pending) {
    entry.pending = buildCoverageInventory(reads).then((value) => { entry.value = value; return value; })
      .finally(() => { entry.pending = undefined; });
  }
  return entry.pending;
}

export function coveragePagePath(kind: TranslationRecordKind, slug: string): string {
  const prefix: Record<TranslationRecordKind, string> = {
    article: "", effect: "/effects", report: "/reports", library: "/articles", replication: "/replications", profile: "/contributors",
  };
  return `${prefix[kind]}/${encodeURIComponent(kind === "profile" ? slug.toLowerCase() : slug)}`;
}
export type TranslationHashUsage = {
  pages: Array<{ label: string; href: string; kind: TranslationRecordKind; slug: string }>;
  total: number;
};

/** Source links for a bounded history page. Unknown/retired hashes have no current usage. */
export async function getTranslationHashUsages(
  reads: PublicDataReadAdapter,
  hashes: readonly string[],
  pageLimit = 20,
): Promise<Record<string, TranslationHashUsage>> {
  const selected = new Set(hashes);
  if (selected.size > 200) throw new Error("Inspect at most 200 translation hashes at once.");
  const result: Record<string, TranslationHashUsage> = Object.fromEntries([...selected].map((hash) => [hash, { pages: [], total: 0 }]));
  if (!selected.size) return result;
  const limit = Number.isFinite(pageLimit) ? Math.max(1, Math.min(50, Math.floor(pageLimit))) : 20;
  const inventory = await getCoverageInventory(reads);
  for (const record of inventory.records) {
    for (const hash of new Set(record.units.map((unit) => unit.hash))) {
      if (!selected.has(hash)) continue;
      const usage = result[hash];
      usage.total += 1;
      if (usage.pages.length < limit) usage.pages.push({
        label: record.slug, href: coveragePagePath(record.kind, record.slug), kind: record.kind, slug: record.slug,
      });
    }
  }
  return result;
}

const emptyCounts = (): CoverageCounts => ({ records: 0, units: 0, current: 0, missing: 0, stale: 0, rejected: 0, glossaryMisses: 0, repeatedPunctuation: 0, leftoverLatin: 0 });

export function summarizeTranslationCoverage(input: {
  inventory: CoverageInventory;
  context: TranslationContext;
  stored: ReadonlyMap<string, CoverageStoredUnit>;
  rejections: ReadonlyMap<string, TranslationRejectionRow>;
  queue: TranslationQueueCoverage;
}): TranslationCoverageResponse {
  const { inventory, context, stored, rejections, queue } = input;
  const terms = Object.entries(context.glossary).map(([term, target]) => ({ term, target, pattern: glossaryTermPattern(term) }));
  // Substance article slugs are the names rule 2 keeps in Latin in lowercase prose.
  const latinNames = inventory.records.filter((record) => record.kind === "article").map((record) => record.slug);
  const chinese = context.locale.scriptGate === "simplified";
  const summary = emptyCounts();
  const byKind = TRANSLATION_RECORD_KINDS.map((kind) => ({ kind, ...emptyCounts() }));
  const pages: TranslationCoverageResponse["pages"] = [];
  let affectedPagesTotal = 0;
  for (const record of inventory.records) {
    const counts = emptyCounts();
    counts.records = 1;
    const scopedTerms = terms.filter(({ term }) => kindInContext(context.kinds[term] ?? "", new Set([record.kind])));
    for (const unit of record.units) {
      counts.units += 1;
      const row = stored.get(unit.hash);
      // A failed replacement can coexist with a previously displayed translation.
      // Rejected takes precedence so the four states remain mutually exclusive.
      if (rejections.has(unit.hash)) counts.rejected += 1;
      else if (!row || !row.target.trim()) counts.missing += 1;
      else if (row.prompt_version !== context.promptVersion) counts.stale += 1;
      else counts.current += 1;
      if (row && scopedTerms.some(({ pattern, target }) => pattern.test(unit.source) && !row.target.includes(target))) counts.glossaryMisses += 1;
      if (row?.target.trim() && findRepeatedPunctuation(unit.source, row.target).length > 0) counts.repeatedPunctuation += 1;
      if (chinese && row?.target.trim() && findLeftoverLatin({ source: unit.source, target: row.target, glossary: context.glossary, latinNames }).length > 0) counts.leftoverLatin += 1;
    }
    const kindCounts = byKind.find((entry) => entry.kind === record.kind)!;
    for (const key of Object.keys(counts) as Array<keyof CoverageCounts>) { summary[key] += counts[key]; kindCounts[key] += counts[key]; }
    if (counts.missing + counts.stale + counts.rejected + counts.glossaryMisses + counts.repeatedPunctuation + counts.leftoverLatin > 0) {
      affectedPagesTotal += 1;
      if (pages.length < PAGES_LIMIT) pages.push({ ...counts, kind: record.kind, slug: record.slug, href: coveragePagePath(record.kind, record.slug) });
    }
  }
  return {
    ok: true, locale: context.locale.code, generatedAt: Date.now(), inventoryGeneratedAt: inventory.generatedAt,
    scope: "public-records", uniqueHashes: new Set(inventory.records.flatMap((record) => record.units.map((unit) => unit.hash))).size, summary, byKind, pages, affectedPagesTotal, pagesLimit: PAGES_LIMIT, queue,
    exclusions: [
      "This inventory covers the six runtime record corpora, not every rendered page or UI string.",
      "Source identity, URLs, numeric fields, citation metadata, attribution, and other corpus-excluded fields remain canonical by design.",
      "Blog publications, unpublished records, and non-publishable replications are outside these public translation corpora.",
      "Copy blocks, About content, warning datasets, UI catalogs, and generated labels need separate catalog or rendered-page verification.",
      "Current means stored under the current prompt digest. It does not mean human-reviewed, linguistically correct, or verified live.",
      "Glossary disagreements are advisory and may need a contextual exception; they overlap storage states.",
      "Doubled punctuation and leftover English count stored targets and overlap storage states. Doubled punctuation blocks new output; leftover English is a review finding.",
    ],
    publication: { status: "unverified", message: "Stored coverage and completed jobs do not establish what is deployed or rendered. Verify the public mirror separately." },
  };
}

export async function getTranslationCoverage(reads: PublicDataReadAdapter, context: TranslationContext): Promise<TranslationCoverageResponse> {
  const inventory = await getCoverageInventory(reads);
  const hashes = [...new Set(inventory.records.flatMap((record) => record.units.map((unit) => unit.hash)))];
  const stored = new Map<string, CoverageStoredUnit>();
  const rejections = new Map<string, TranslationRejectionRow>();
  // Keep database argument arrays bounded even on a full corpus audit.
  for (let start = 0; start < hashes.length; start += 1000) {
    const batch = hashes.slice(start, start + 1000);
    const [rows, rejected] = await Promise.all([
      readTranslationCoverageRows(context.locale.code, batch), readTranslationRejections(context.locale.code, batch),
    ]);
    for (const row of rows) stored.set(row.hash, row);
    for (const [hash, row] of rejected) rejections.set(hash, row);
  }
  const queue = await translationQueueCoverage(context.locale.code);
  return summarizeTranslationCoverage({ inventory, context, stored, rejections, queue });
}
