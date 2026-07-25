import { collectCitationIdsFromContent } from "@/lib/citations/referenceModel";
import type { SubstanceArticle } from "@/schema";
import { SUBSTANCE_SECTION_MANIFEST } from "@/schema/substance/sectionManifest";
import {
  substanceVisibility,
  type SubstanceVisibility,
} from "@/schema/substance/substanceVisibilityPolicy";
import type {
  SubstanceArticleFieldKey,
  SubstanceSectionId,
} from "@/schema/substance/sectionCatalog";

/**
 * The article subsections this audit reports on, in article reading order.
 *
 * Two public sections are deliberately absent. `reagent-testing` resolves its
 * presence partly from a client-side external reagent lookup, so a server-side
 * verdict would call sections empty that render fine in the browser. `sources`
 * is the bibliography itself — it is the citation axis rather than a column in
 * it, and appears here as the per-article bibliography state instead.
 */
export const COVERAGE_SECTION_IDS = [
  "dosage-duration",
  "subjective-effects",
  "pharmacology",
  "interactions",
  "tolerance",
  "harm-potential",
  "history-culture",
  "legality",
] as const satisfies readonly SubstanceSectionId[];

export type CoverageSectionId = (typeof COVERAGE_SECTION_IDS)[number];

/** Column header abbreviations. The full label stays available as a tooltip. */
const COVERAGE_SECTION_SHORT_LABELS: Record<CoverageSectionId, string> = {
  "dosage-duration": "Dose",
  "subjective-effects": "Effects",
  pharmacology: "Pharm",
  interactions: "Inter",
  tolerance: "Toler",
  "harm-potential": "Harm",
  "history-culture": "History",
  legality: "Legal",
};

export interface CoverageColumn {
  id: CoverageSectionId;
  label: string;
  shortLabel: string;
  icon: string;
  fields: SubstanceArticleFieldKey[];
}

/**
 * Whether a section holds publishable content.
 *
 * `filled` and `empty` mirror the manifest predicates the article page and the
 * table of contents already use, so this audit cannot disagree with what a
 * reader actually sees.
 */
export type CoverageContentStatus = "filled" | "empty";

/**
 * Whether a section carries citations, and — when it does not — whether that
 * absence means anything.
 *
 * - `cited`: the section's own fields carry citation markers.
 * - `bare`: the article has a structured bibliography, so the citation pipeline
 *   has run over it, and this section still came away with nothing. This is the
 *   only status that represents a real, examined gap.
 * - `unattempted`: the article has no structured bibliography, so no pass has
 *   reached this section and its emptiness carries no information.
 * - `not-applicable`: the section has no content, so there is nothing to cite.
 */
export type CoverageCitationStatus =
  | "cited"
  | "bare"
  | "unattempted"
  | "not-applicable";

/**
 * How far an article has progressed through the citation pipeline.
 *
 * `structured` means the article carries `references[]` — the shape the citation
 * workbench produces. `legacy` means it still has only the pre-pipeline
 * bibliography lists, which is not a pass. The distinction is what separates
 * "we looked and found nothing" from "nobody has looked yet".
 */
export type CoverageBibliographyState = "structured" | "legacy" | "none";

export interface CoverageRow {
  slug: string;
  name: string;
  /**
   * Whether the article is listed on the public substance index.
   *
   * `public` is the default scope for this audit: everything a reader can
   * actually reach by browsing. `hidden` and `low_priority` articles exist but
   * are kept off the index, and counting their gaps by default would drown the
   * numbers that describe the published site.
   */
  visibility: SubstanceVisibility;
  bibliography: CoverageBibliographyState;
  /** Aligned with `COVERAGE_SECTION_IDS`. */
  content: CoverageContentStatus[];
  /** Aligned with `COVERAGE_SECTION_IDS`. */
  citations: CoverageCitationStatus[];
  /** Count of `empty` entries in `content`, for gap-first sorting. */
  emptyCount: number;
  /** Count of `bare` entries in `citations`, for gap-first sorting. */
  bareCount: number;
}

export type CoverageArticleInput = SubstanceArticle & { slug?: string };

/**
 * Column definitions, read from the section manifest so labels, icons, and the
 * field lists a section owns stay in one place.
 */
export function getCoverageColumns(): CoverageColumn[] {
  return COVERAGE_SECTION_IDS.map((id) => {
    const entry = SUBSTANCE_SECTION_MANIFEST.find(
      (candidate) => candidate.id === id,
    );
    if (!entry) {
      throw new Error(
        `Coverage column "${id}" has no entry in the substance section manifest.`,
      );
    }
    return {
      id,
      label: entry.label,
      shortLabel: COVERAGE_SECTION_SHORT_LABELS[id],
      icon: entry.icon,
      fields: entry.articleFields,
    };
  });
}

function getSectionPresence(
  article: SubstanceArticle,
  id: CoverageSectionId,
): CoverageContentStatus {
  const entry = SUBSTANCE_SECTION_MANIFEST.find(
    (candidate) => candidate.id === id,
  );
  const isPresent = entry?.public.isPresent;
  // A section with no predicate always has something to show.
  if (!isPresent) return "filled";
  return isPresent(article) ? "filled" : "empty";
}

/**
 * Whether a value tree contains a populated `reference_ids` array.
 *
 * Citations reach an article two ways. Prose sections take inline `[cite:id]`
 * tokens, but the workbench attaches dosage and duration evidence to structured
 * `reference_ids` on individual routes instead. Scanning only for tokens
 * reports every dosage section in the corpus as uncited.
 */
function hasStructuredReferenceIds(value: unknown): boolean {
  const seen = new WeakSet<object>();

  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return false;
    if (seen.has(node)) return false;
    seen.add(node);

    if (Array.isArray(node)) return node.some(walk);

    for (const [key, child] of Object.entries(node)) {
      if (key === "reference_ids" && Array.isArray(child) && child.length > 0) {
        return true;
      }
      if (walk(child)) return true;
    }
    return false;
  };

  return walk(value);
}

function hasSectionCitations(
  article: SubstanceArticle,
  fields: SubstanceArticleFieldKey[],
): boolean {
  return fields.some((field) => {
    const value = article[field];
    return (
      collectCitationIdsFromContent(value).length > 0 ||
      hasStructuredReferenceIds(value)
    );
  });
}

export function getBibliographyState(
  article: SubstanceArticle,
): CoverageBibliographyState {
  if ((article.references?.length ?? 0) > 0) return "structured";
  const legacyCount =
    (article.source_citations?.length ?? 0) + (article.citations?.length ?? 0);
  return legacyCount > 0 ? "legacy" : "none";
}

export function buildCoverageRow(
  article: CoverageArticleInput,
  columns: CoverageColumn[],
): CoverageRow {
  const bibliography = getBibliographyState(article);

  const content = columns.map((column) =>
    getSectionPresence(article, column.id),
  );

  const citations = columns.map((column, index): CoverageCitationStatus => {
    if (content[index] === "empty") return "not-applicable";
    if (hasSectionCitations(article, column.fields)) return "cited";
    return bibliography === "structured" ? "bare" : "unattempted";
  });

  return {
    slug: article.slug ?? "",
    name: article.title,
    visibility: substanceVisibility({
      indexCategories: article.index_categories,
      priority: article.priority,
    }),
    bibliography,
    content,
    citations,
    emptyCount: content.filter((status) => status === "empty").length,
    bareCount: citations.filter((status) => status === "bare").length,
  };
}

export function buildCoverageRows(
  articles: CoverageArticleInput[],
  columns: CoverageColumn[] = getCoverageColumns(),
): CoverageRow[] {
  return articles
    .filter((article) => Boolean(article.slug))
    .map((article) => buildCoverageRow(article, columns))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export interface CoverageColumnTotals {
  filled: number;
  empty: number;
  cited: number;
  bare: number;
  unattempted: number;
}

export interface CoverageTotals {
  articles: number;
  /** Articles whose bibliography shows a citation pass has run. */
  articlesWithPass: number;
  sections: number;
  filled: number;
  cited: number;
  bare: number;
  /** Per column, aligned with `COVERAGE_SECTION_IDS`. */
  perColumn: CoverageColumnTotals[];
}

export function buildCoverageTotals(
  rows: CoverageRow[],
  columns: CoverageColumn[] = getCoverageColumns(),
): CoverageTotals {
  const perColumn: CoverageColumnTotals[] = columns.map(() => ({
    filled: 0,
    empty: 0,
    cited: 0,
    bare: 0,
    unattempted: 0,
  }));

  for (const row of rows) {
    columns.forEach((_column, index) => {
      const totals = perColumn[index];
      if (row.content[index] === "filled") totals.filled += 1;
      else totals.empty += 1;

      const citation = row.citations[index];
      if (citation === "cited") totals.cited += 1;
      else if (citation === "bare") totals.bare += 1;
      else if (citation === "unattempted") totals.unattempted += 1;
    });
  }

  return {
    articles: rows.length,
    articlesWithPass: rows.filter((row) => row.bibliography === "structured")
      .length,
    sections: rows.length * columns.length,
    filled: perColumn.reduce((sum, totals) => sum + totals.filled, 0),
    cited: perColumn.reduce((sum, totals) => sum + totals.cited, 0),
    bare: perColumn.reduce((sum, totals) => sum + totals.bare, 0),
    perColumn,
  };
}
