import type { SubstanceArticle } from "@/schema";
import type {
  ReportCardModel,
  ReportViewMode,
  TripReport,
} from "@/types/tripReport";
import { slugify } from "@/utils/slug";
import { tripDateSortValue } from "@/utils/tripReportDate";
import { formatMessage, msg, type Translate } from "@/i18n/messages";

export type ReportSortDirection = "asc" | "desc";
export type ReportSortKey = "alphabetical" | "count" | "date";

/**
 * What a group heading already tells the reader, so a row never repeats it.
 * `mixed` covers the catch-all shelves (combinations, folded singletons) whose
 * heading names no single substance and no single author.
 */
type ReportGroupKind = "substance" | "author" | "letter" | "mixed"

const COMBINATIONS_GROUP_NAME = msg("Combinations")
const OTHER_SUBSTANCES_GROUP_NAME = msg("Other substances")

export interface TripReportGroup<TReport> {
  name: string;
  /** Stable in-page anchor, so a substance section is linkable and jumpable. */
  anchor: string;
  kind: ReportGroupKind;
  reports: TReport[];
  /** Full group size when the reports array is a bounded browsing page. */
  reportCount?: number;
}

export interface SubstanceTripReportGroups<TReport> {
  allReports: TReport[];
  singleSubstanceReports: TReport[];
  combinationReports: TReport[];
}

export interface PreparedSubstanceTripReports<TReport> extends SubstanceTripReportGroups<TReport> {
  totalReports: number;
  hasMore: boolean;
  totalHidden: number;
}

export interface ReportBackTarget {
  href: string;
  label: string;
}

export interface SubstanceLookupRecord {
  name: string;
}

type ReportLike = Pick<
  ReportCardModel,
  "slug" | "title" | "featured" | "subject" | "substances"
> & { publishedAt?: string };

export function getSubstanceSearchNames(article: Pick<SubstanceArticle, "title" | "identification">): string[] {
  return uniqueTrimmed([
    article.title,
    article.identification?.common_name,
    ...(article.identification?.alternative_names ?? []),
  ]);
}

export function reportMatchesSubstance(
  report: Pick<TripReport, "substances">,
  article: Pick<SubstanceArticle, "title" | "identification">,
): boolean {
  const searchKeys = new Set(getSubstanceSearchNames(article).flatMap(getNameMatchKeys));

  return report.substances.some((substance) =>
    getNameMatchKeys(substance.name).some((key) => searchKeys.has(key)),
  );
}

export function groupTripReports<TReport extends ReportLike>(
  reports: TReport[],
  viewMode: ReportViewMode,
  sortDirection: ReportSortDirection,
  sortKey: ReportSortKey = "alphabetical",
): TripReportGroup<TReport>[] {
  if (viewMode === "title") {
    return orderGroups(
      Object.entries(
        groupBy(reports, (report) => {
          const initial = report.title.trim().charAt(0).toUpperCase();
          return /^[A-Z]$/.test(initial) ? initial : "#";
        }),
      ).map(([name, groupReports]) => ({
        name,
        anchor: `letter-${slugify(name) || "other"}`,
        kind: "letter" as const,
        reports: sortWithinGroup(groupReports, sortKey, sortDirection),
      })),
      sortKey,
      sortDirection,
    );
  }

  if (viewMode === "author") {
    return orderGroups(
      Object.entries(groupBy(reports, (report) => report.subject.name)).map(([name, groupReports]) => ({
        name,
        anchor: `author-${slugify(name) || "unattributed"}`,
        kind: "author" as const,
        reports: sortWithinGroup(groupReports, sortKey, "asc"),
      })),
      sortKey,
      sortDirection,
    );
  }

  const singleSubstanceReports = reports.filter((report) => report.substances.length === 1);
  const combinationReports = reports.filter((report) => report.substances.length > 1);
  const groups = orderGroups(
    Object.entries(groupBy(singleSubstanceReports, (report) => report.substances[0]?.name ?? ""))
      .filter(([name]) => name.length > 0)
      .map(([name, groupReports]) => ({
        name,
        anchor: `substance-${slugify(name)}`,
        kind: "substance" as const,
        reports: sortWithinGroup(groupReports, sortKey, "asc"),
      })),
    sortKey,
    sortDirection,
  );

  if (combinationReports.length > 0) {
    groups.push({
      name: COMBINATIONS_GROUP_NAME,
      anchor: "substance-combinations",
      kind: "mixed",
      reports: sortWithinGroup(combinationReports, sortKey, "asc"),
    });
  }

  return groups;
}

/**
 * Collapse the long tail of one-report substances into a single shelf. Sixty of
 * the corpus's eighty-nine substance groups hold exactly one report, and a
 * heading plus divider costs more vertical space than the row it introduces.
 * Left alone below `minFolded` foldable groups, so a filtered index that is
 * already short does not grow a pointless catch-all.
 */
export function foldSparseGroups<TReport>(
  groups: readonly TripReportGroup<TReport>[],
  options: { name?: string; minGroupSize?: number; minFolded?: number } = {},
): TripReportGroup<TReport>[] {
  const name = options.name ?? OTHER_SUBSTANCES_GROUP_NAME;
  const minGroupSize = options.minGroupSize ?? 2;
  const minFolded = options.minFolded ?? 3;
  const foldable = groups.filter(
    (group) => group.kind === "substance" && group.reports.length < minGroupSize,
  );

  if (foldable.length < minFolded) {
    return [...groups];
  }

  const kept = groups.filter((group) => !foldable.includes(group));
  const folded: TripReportGroup<TReport> = {
    name,
    anchor: "substance-other",
    kind: "mixed",
    reports: foldable.flatMap((group) => group.reports),
  };
  const tailIndex = kept.findIndex((group) => group.kind === "mixed");

  return tailIndex === -1
    ? [...kept, folded]
    : [...kept.slice(0, tailIndex), folded, ...kept.slice(tailIndex)];
}

/**
 * The band's two lists.
 *
 * `added` answers "what is new here", which is the only question the front
 * door could not answer before: nineteen of the corpus's reports are featured
 * and the band holds five, so a featured-first order could never surface
 * anything newer than the oldest curation decision. It ranks on the read-edge
 * publication date, then falls back to the experience date, so a deployment
 * whose projection predates `published_at` still orders the band by the most
 * recent thing it can prove rather than by nothing.
 *
 * `featured` is the curated shelf, still newest-experience-first inside it.
 */
export function selectRecentlyAddedReports<TReport extends ReportLike>(
  reports: readonly TReport[],
  limit: number,
): TReport[] {
  return [...reports]
    .sort((left, right) => {
      const delta = publicationValue(right) - publicationValue(left);
      if (delta !== 0) {
        return delta;
      }
      const experience = reportDateValue(right) - reportDateValue(left);
      return experience !== 0 ? experience : left.title.localeCompare(right.title);
    })
    .slice(0, Math.max(limit, 0));
}

export function selectFeaturedReports<TReport extends ReportLike>(
  reports: readonly TReport[],
  limit: number,
): TReport[] {
  return [...reports]
    .filter((report) => report.featured)
    .sort((left, right) => {
      const delta = reportDateValue(right) - reportDateValue(left);
      return delta !== 0 ? delta : left.title.localeCompare(right.title);
    })
    .slice(0, Math.max(limit, 0));
}

/**
 * An unparseable or absent publication date sinks below every dated row
 * rather than being treated as new, the same rule `workDateMs` applies to the
 * replication gallery.
 */
function publicationValue<TReport extends ReportLike>(report: TReport): number {
  const parsed = report.publishedAt ? Date.parse(report.publishedAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortWithinGroup<TReport extends ReportLike>(
  reports: readonly TReport[],
  sortKey: ReportSortKey,
  direction: ReportSortDirection,
): TReport[] {
  if (sortKey !== "date") {
    return sortByTitle(reports, direction);
  }

  const factor = direction === "asc" ? 1 : -1;
  return [...reports].sort((left, right) => {
    const delta = reportDateValue(left) - reportDateValue(right);
    return delta !== 0 ? factor * delta : left.title.localeCompare(right.title);
  });
}

/**
 * Catch-all shelves stay pinned last whatever the sort: they name no substance,
 * so letting a fifteen-report combinations bucket win a count sort would open
 * the index on the one heading that says nothing.
 */
function orderGroups<TReport extends ReportLike>(
  groups: TripReportGroup<TReport>[],
  sortKey: ReportSortKey,
  direction: ReportSortDirection,
): TripReportGroup<TReport>[] {
  const factor = direction === "asc" ? 1 : -1;

  if (sortKey === "alphabetical") {
    return groups.sort((left, right) => factor * left.name.localeCompare(right.name));
  }

  // Rank once per group: a comparator that rescanned a group's reports on every
  // comparison would walk the whole corpus O(n log n) times.
  return groups
    .map((group) => ({
      group,
      rank:
        sortKey === "count"
          ? group.reports.length
          : group.reports.reduce((newest, report) => Math.max(newest, reportDateValue(report)), 0),
    }))
    .sort((left, right) =>
      left.rank === right.rank
        ? left.group.name.localeCompare(right.group.name)
        : factor * (left.rank - right.rank),
    )
    .map((entry) => entry.group);
}

function reportDateValue<TReport extends Pick<ReportLike, "subject">>(report: TReport): number {
  return tripDateSortValue(report.subject.trip_date) ?? 0;
}

export function getSubstanceTripReportGroups<TReport extends Pick<TripReport, "featured" | "substances" | "title">>(
  reports: TReport[],
): SubstanceTripReportGroups<TReport> {
  const allReports = sortFeaturedFirst(reports);

  return {
    allReports,
    singleSubstanceReports: sortFeaturedFirst(allReports.filter((report) => report.substances.length === 1)),
    combinationReports: sortFeaturedFirst(allReports.filter((report) => report.substances.length > 1)),
  };
}

export function prepareSubstanceTripReports<TReport extends Pick<TripReport, "featured" | "substances" | "title">>(
  reports: TReport[],
  options: {
    collapsedLimit: number;
    minHiddenForCollapse?: number;
    article?: Pick<SubstanceArticle, "title" | "identification">;
  },
): PreparedSubstanceTripReports<TReport> {
  const matchedReports = options.article
    ? reports.filter((report) => reportMatchesSubstance(report, options.article!))
    : reports;
  const groups = getSubstanceTripReportGroups(matchedReports);
  const totalReports = groups.singleSubstanceReports.length + groups.combinationReports.length;
  const totalHidden = Math.max(0, totalReports - options.collapsedLimit);
  const minHiddenForCollapse = options.minHiddenForCollapse ?? 1;
  const hasMore = totalHidden >= minHiddenForCollapse;

  return {
    ...groups,
    totalReports,
    hasMore,
    totalHidden: hasMore ? totalHidden : 0,
  };
}

export function getVisibleSubstanceTripReports<TReport>(
  prepared: Pick<PreparedSubstanceTripReports<TReport>, "singleSubstanceReports" | "combinationReports" | "hasMore">,
  options: {
    collapsedLimit: number;
    isExpanded: boolean;
  },
): Pick<SubstanceTripReportGroups<TReport>, "singleSubstanceReports" | "combinationReports"> {
  if (options.isExpanded || !prepared.hasMore) {
    return {
      singleSubstanceReports: prepared.singleSubstanceReports,
      combinationReports: prepared.combinationReports,
    };
  }

  const singleCount = Math.min(prepared.singleSubstanceReports.length, options.collapsedLimit);
  const remainingSlots = options.collapsedLimit - singleCount;

  return {
    singleSubstanceReports: prepared.singleSubstanceReports.slice(0, singleCount),
    combinationReports: prepared.combinationReports.slice(0, remainingSlots),
  };
}

export function getReportBackTarget({
  report,
  substanceBySlug,
  fromSubstanceSlug,
  translate = formatMessage,
}: {
  report?: Pick<TripReport, "substances"> | null;
  substanceBySlug: Record<string, SubstanceLookupRecord> | Map<string, SubstanceLookupRecord>;
  fromSubstanceSlug?: string;
  /**
   * The `t` of the surface rendering the label, so "Back to …" names the
   * target in the UI locale. Defaults to English formatting.
   */
  translate?: Translate;
}): ReportBackTarget {
  const lookup = substanceBySlug instanceof Map ? substanceBySlug : new Map(Object.entries(substanceBySlug));
  const normalizedFromSlug = fromSubstanceSlug?.trim() || undefined;
  const href = normalizedFromSlug ? `/${normalizedFromSlug}` : "/reports";
  const backToSubstance = getBackSubstanceName({ report, lookup, fromSubstanceSlug: normalizedFromSlug });

  return {
    href,
    label: backToSubstance
      ? translate(msg("Back to {{substance}}"), { substance: backToSubstance })
      : translate(msg("Back to Reports")),
  };
}

function getBackSubstanceName({
  report,
  lookup,
  fromSubstanceSlug,
}: {
  report?: Pick<TripReport, "substances"> | null;
  lookup: Map<string, SubstanceLookupRecord>;
  fromSubstanceSlug?: string;
}): string | null {
  if (fromSubstanceSlug) {
    const substance = lookup.get(fromSubstanceSlug);
    if (substance) {
      return substance.name;
    }
  }

  if (!report || report.substances.length === 0) {
    return null;
  }

  const lookupByNameKey = new Map<string, SubstanceLookupRecord>();
  for (const substanceRecord of lookup.values()) {
    for (const key of getNameMatchKeys(substanceRecord.name)) {
      lookupByNameKey.set(key, substanceRecord);
    }
  }

  for (const reportSubstance of report.substances) {
    const bySlug = lookup.get(slugify(reportSubstance.name));
    if (bySlug) {
      return bySlug.name;
    }

    for (const key of getNameMatchKeys(reportSubstance.name)) {
      const byName = lookupByNameKey.get(key);
      if (byName) {
        return byName.name;
      }
    }
  }

  return null;
}

function uniqueTrimmed(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function getNameMatchKeys(name: string): string[] {
  const normalized = normalizeName(name);
  return normalized ? [normalized, slugify(name)] : [];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function sortByTitle<TReport extends Pick<ReportLike, "title">>(
  reports: readonly TReport[],
  direction: ReportSortDirection,
): TReport[] {
  return [...reports].sort((a, b) =>
    direction === "asc" ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title),
  );
}

function sortFeaturedFirst<TReport extends Pick<TripReport, "featured" | "title">>(reports: readonly TReport[]): TReport[] {
  return [...reports].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return a.title.localeCompare(b.title);
  });
}

function groupBy<TReport>(reports: readonly TReport[], getKey: (report: TReport) => string): Record<string, TReport[]> {
  const groups: Record<string, TReport[]> = {};

  for (const report of reports) {
    const key = getKey(report);
    groups[key] ??= [];
    groups[key].push(report);
  }

  return groups;
}
