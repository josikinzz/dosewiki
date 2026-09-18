import { collectCitationIdsFromContent } from "@/lib/citations/referenceModel";
import type { SubstanceArticle } from "@/schema";
import {
  getArticleStubVerdict,
  type ArticleStubReason,
} from "@/schema/substance/articleStubPolicy";
import {
  routeHasDosageContent,
  routeHasDurationContent,
} from "@/schema/substance/dosageDurationPresence";
import { SUBSTANCE_SECTION_MANIFEST } from "@/schema/substance/sectionManifest";
import {
  substanceVisibility,
  type SubstanceVisibility,
} from "@/schema/substance/substanceVisibilityPolicy";
import type {
  SubstanceArticleFieldKey,
  SubstanceSectionId,
} from "@/schema/substance/sectionCatalog";
import { normalizeRouteName } from "@server/article/normalization.mjs";

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

type CoverageSectionId = (typeof COVERAGE_SECTION_IDS)[number];

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

/**
 * Route tables for one article, and how many of them are empty shells.
 *
 * Section presence collapses dosage and duration to a single bit, so an article
 * with four routes where three are hollow scaffolding scores identically to a
 * fully populated one. These counts keep that difference visible.
 *
 * Routes are grouped by canonical name across both sides, the same grouping
 * `DosageDurationSection` uses to build its route tabs ("snorted" and
 * "intranasal" are one route, not two).
 *
 * - `total`: routes the article carries entries for.
 * - `blank`: routes where neither side renders. The section drops these from
 *   the tab strip, so they are ROAs the article claims in its data and offers
 *   the reader nothing for.
 * - `partial`: routes that do render, but where one side is an all-null
 *   scaffold — a dosage entry with no dose values sitting behind a populated
 *   duration table, or the reverse. Invisible on the page and invisible to a
 *   section-level predicate, which is what makes it worth counting.
 */
export interface CoverageRoaCounts {
  total: number;
  blank: number;
  partial: number;
}

/** Routes carrying an empty table on at least one side. */
export function roaHollowCount(roa: CoverageRoaCounts): number {
  return roa.blank + roa.partial;
}

/**
 * Whether the article reads as a stub, decided by `articleStubPolicy` rather
 * than recomputed here.
 *
 * The stub banner the article page renders and this column must never disagree,
 * and they would: the policy weighs the seven always-rendered editorial
 * sections, while this audit tracks eight columns (it adds `interactions`, which
 * is not always rendered). Deriving a verdict from `emptyCount` would quietly
 * drift from the banner.
 */
interface CoverageStubState {
  isStub: boolean;
  reasons: ArticleStubReason[];
}

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
  /** Route tables offered, and how many of them are empty shells. */
  roa: CoverageRoaCounts;
  /** The article-page stub verdict, not a rule this module invents. */
  stub: CoverageStubState;
  /**
   * Whether an editor has completed the manual review of this article.
   *
   * Read from the public-safe `expert_reviewed` derivation of the editor-only
   * `editorial_review.status`, never from the review object itself — this
   * surface only learns that a review finished, not who wrote what about it.
   */
  reviewed: boolean;
  /** Count of `empty` entries in `content`, for gap-first sorting. */
  emptyCount: number;
  /** Count of `bare` entries in `citations`, for gap-first sorting. */
  bareCount: number;
}

export type CoverageArticleInput = SubstanceArticle & {
  slug?: string;
  expert_reviewed?: boolean;
};

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

/**
 * The route name the article page groups by. Two raw entries ("intranasal",
 * "snorted") collapse into one tab, so they have to collapse into one count.
 */
function canonicalRouteName(route: { route?: string | null }): string {
  const raw = typeof route.route === "string" ? route.route : "";
  return (normalizeRouteName(raw) || raw).trim();
}

/** How many entries one side of a route carries, and how many of them render. */
interface RouteSideTally {
  entries: number;
  rendered: number;
}

interface RouteTally {
  dosage: RouteSideTally;
  duration: RouteSideTally;
}

function emptyRouteTally(): RouteTally {
  return {
    dosage: { entries: 0, rendered: 0 },
    duration: { entries: 0, rendered: 0 },
  };
}

function tallyRoutes<T extends { route?: string | null }>(
  routes: readonly T[] | null | undefined,
  hasContent: (route: T) => boolean,
  side: keyof RouteTally,
  into: Map<string, RouteTally>,
): void {
  if (!Array.isArray(routes)) return;
  for (const route of routes) {
    if (!route || typeof route !== "object") continue;
    const name = canonicalRouteName(route);
    // An unnamed route never reaches the tab strip, so it is not a table a
    // reader can find empty.
    if (!name) continue;
    let tally = into.get(name);
    if (!tally) {
      tally = emptyRouteTally();
      into.set(name, tally);
    }
    tally[side].entries += 1;
    if (hasContent(route)) tally[side].rendered += 1;
  }
}

function getRoaCounts(article: SubstanceArticle): CoverageRoaCounts {
  const byRoute = new Map<string, RouteTally>();
  tallyRoutes(article.dosage?.routes, routeHasDosageContent, "dosage", byRoute);
  tallyRoutes(
    article.duration?.routes,
    routeHasDurationContent,
    "duration",
    byRoute,
  );

  let blank = 0;
  let partial = 0;
  for (const tally of byRoute.values()) {
    if (tally.dosage.rendered === 0 && tally.duration.rendered === 0) {
      blank += 1;
      continue;
    }
    // A side the article never claimed is a different kind of gap — a
    // duration-only route is legitimate. Only an entry that exists and renders
    // nothing is scaffolding.
    const hollowSide =
      (tally.dosage.entries > 0 && tally.dosage.rendered === 0) ||
      (tally.duration.entries > 0 && tally.duration.rendered === 0);
    if (hollowSide) partial += 1;
  }

  return { total: byRoute.size, blank, partial };
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

  const verdict = getArticleStubVerdict(article);

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
    roa: getRoaCounts(article),
    stub: { isStub: verdict.isStub, reasons: verdict.reasons },
    reviewed: article.expert_reviewed === true,
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

interface CoverageColumnTotals {
  filled: number;
  empty: number;
  cited: number;
  bare: number;
  unattempted: number;
}

interface CoverageRoaTotals {
  total: number;
  blank: number;
  partial: number;
  articlesWithHollow: number;
}

export interface CoverageTotals {
  articles: number;
  /** Articles whose bibliography shows a citation pass has run. */
  articlesWithPass: number;
  sections: number;
  filled: number;
  cited: number;
  bare: number;
  /** Articles the stub policy would banner. */
  stubs: number;
  /** Articles whose manual editorial review is completed. */
  reviewed: number;
  roa: CoverageRoaTotals;
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

  const roa: CoverageRoaTotals = {
    total: 0,
    blank: 0,
    partial: 0,
    articlesWithHollow: 0,
  };
  for (const row of rows) {
    roa.total += row.roa.total;
    roa.blank += row.roa.blank;
    roa.partial += row.roa.partial;
    if (roaHollowCount(row.roa) > 0) roa.articlesWithHollow += 1;
  }

  return {
    articles: rows.length,
    articlesWithPass: rows.filter((row) => row.bibliography === "structured")
      .length,
    sections: rows.length * columns.length,
    filled: perColumn.reduce((sum, totals) => sum + totals.filled, 0),
    cited: perColumn.reduce((sum, totals) => sum + totals.cited, 0),
    bare: perColumn.reduce((sum, totals) => sum + totals.bare, 0),
    stubs: rows.filter((row) => row.stub.isStub).length,
    reviewed: rows.filter((row) => row.reviewed).length,
    roa,
    perColumn,
  };
}

/**
 * The launch date the manual review push is working toward. The countdown
 * banner reads this; delete the banner (or move the date) after launch.
 */
export const REVIEW_DEADLINE = {
  /** Local end of the deadline day: reviews landing on the 31st still count. */
  year: 2026,
  monthIndex: 7, // August
  day: 31,
  label: "August 31",
} as const;

export interface ReviewCountdown {
  /** Articles in the review corpus (public visibility only). */
  total: number;
  reviewed: number;
  remaining: number;
  /** Whole days until the deadline day ends; 0 on and after the deadline. */
  daysLeft: number;
  /** Articles per day to finish in time, null once the deadline has passed. */
  perDay: number | null;
}

/**
 * Deadline arithmetic for the review push.
 *
 * Counts only publicly listed articles — the launch corpus — regardless of the
 * table's scope toggle, so the headline number cannot be accidentally inflated
 * by flipping "include unlisted" on.
 */
export function buildReviewCountdown(
  rows: CoverageRow[],
  now: Date,
): ReviewCountdown {
  const corpus = rows.filter((row) => row.visibility === "public");
  const reviewed = corpus.filter((row) => row.reviewed).length;
  const remaining = corpus.length - reviewed;

  const deadlineEnd = new Date(
    REVIEW_DEADLINE.year,
    REVIEW_DEADLINE.monthIndex,
    REVIEW_DEADLINE.day + 1,
  );
  const msLeft = deadlineEnd.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.floor(msLeft / 86_400_000));

  return {
    total: corpus.length,
    reviewed,
    remaining,
    daysLeft,
    perDay: daysLeft > 0 ? remaining / daysLeft : null,
  };
}
