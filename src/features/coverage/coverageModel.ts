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

export type CoverageContentStatus = "filled" | "empty";

export type CoverageCitationStatus =
  | "cited"
  | "bare"
  | "unattempted"
  | "not-applicable";

export type CoverageBibliographyState = "structured" | "legacy" | "none";

export interface CoverageRoaCounts {
  total: number;
  blank: number;
  partial: number;
}

export function roaHollowCount(roa: CoverageRoaCounts): number {
  return roa.blank + roa.partial;
}

interface CoverageStubState {
  isStub: boolean;
  reasons: ArticleStubReason[];
}

export interface CoverageRow {
  slug: string;
  name: string;
  visibility: SubstanceVisibility;
  bibliography: CoverageBibliographyState;
  content: CoverageContentStatus[];
  citations: CoverageCitationStatus[];
  roa: CoverageRoaCounts;
  stub: CoverageStubState;
  reviewed: boolean;
  emptyCount: number;
  bareCount: number;
}

export type CoverageArticleInput = SubstanceArticle & {
  slug?: string;
  expert_reviewed?: boolean;
};

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
  if (!isPresent) return "filled";
  return isPresent(article) ? "filled" : "empty";
}

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

function canonicalRouteName(route: { route?: string | null }): string {
  const raw = typeof route.route === "string" ? route.route : "";
  return (normalizeRouteName(raw) || raw).trim();
}

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
  hasContent: (route: NoInfer<T>) => boolean,
  side: keyof RouteTally,
  into: Map<string, RouteTally>,
): void {
  if (!Array.isArray(routes)) return;
  for (const route of routes) {
    if (!route || typeof route !== "object") continue;
    const name = canonicalRouteName(route);
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
  articlesWithPass: number;
  sections: number;
  filled: number;
  cited: number;
  bare: number;
  stubs: number;
  reviewed: number;
  roa: CoverageRoaTotals;
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

export const REVIEW_DEADLINE = {
  year: 2026,
  monthIndex: 7,
  day: 31,
  label: "August 31",
} as const;

export interface ReviewCountdown {
  total: number;
  reviewed: number;
  remaining: number;
  daysLeft: number;
  perDay: number | null;
}

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
