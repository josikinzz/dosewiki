import type { SubstanceArticle } from "@/schema";
import type {
  PublicReportPreview,
  ReportCardModel,
  ReportViewMode,
  TripReport,
  TripReportDetailRecord,
} from "@/types/tripReport";
import { slugify } from "@/utils/slug";

export type ReportSortDirection = "asc" | "desc";
export type ReportSortKey = "alphabetical" | "count";

export interface TripReportGroup<TReport> {
  name: string;
  reports: TReport[];
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

type ReportLike = Pick<ReportCardModel, "slug" | "title" | "featured" | "subject" | "substances">;

export const toTripReportPreviewModel = (report: PublicReportPreview | TripReportDetailRecord): ReportCardModel => {
  if ("author" in report) {
    return {
      slug: report.slug,
      title: report.title,
      featured: report.featured,
      subject: {
        name: report.author,
        trip_date: report.tripDate,
        avatar_url: report.authorAvatarUrl ?? undefined,
        profile_key: report.authorProfileKey,
      },
      substances: report.substanceNames.map((name) => ({ name })),
    };
  }

  return {
    slug: report.slug,
    title: report.title,
    featured: report.featured === true,
    subject: {
      name: report.subject.name,
      trip_date: report.subject.trip_date,
      avatar_url: report.subject.avatar_url,
      profile_key: report.subject.profile_key,
    },
    substances: report.substances,
  };
};

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
    return [
      {
        name: "All Reports",
        reports: sortByTitle(reports, sortDirection),
      },
    ];
  }

  if (viewMode === "author") {
    const groups = sortGroupEntries(groupBy(reports, (report) => report.subject.name), sortDirection).map(([name, groupReports]) => ({
      name,
      reports: sortByTitle(groupReports, "asc"),
    }));
    return sortKey === "count" ? sortGroupsByCount(groups, sortDirection) : groups;
  }

  const singleSubstanceReports = reports.filter((report) => report.substances.length === 1);
  const combinationReports = reports.filter((report) => report.substances.length > 1);
  const groups = sortGroupEntries(
    groupBy(singleSubstanceReports, (report) => report.substances[0]?.name ?? ""),
    sortDirection,
  )
    .filter(([name]) => name.length > 0)
    .map(([name, groupReports]) => ({
      name,
      reports: sortByTitle(groupReports, "asc"),
    }));

  if (combinationReports.length > 0) {
    groups.push({
      name: "Combinations",
      reports: sortByTitle(combinationReports, "asc"),
    });
  }

  return sortKey === "count" ? sortGroupsByCount(groups, sortDirection) : groups;
}

function sortGroupsByCount<TReport>(
  groups: TripReportGroup<TReport>[],
  direction: ReportSortDirection,
): TripReportGroup<TReport>[] {
  return [...groups].sort((a, b) => {
    const delta = direction === "asc"
      ? a.reports.length - b.reports.length
      : b.reports.length - a.reports.length;
    return delta !== 0 ? delta : a.name.localeCompare(b.name);
  });
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
}: {
  report?: Pick<TripReport, "substances"> | null;
  substanceBySlug: Record<string, SubstanceLookupRecord> | Map<string, SubstanceLookupRecord>;
  fromSubstanceSlug?: string;
}): ReportBackTarget {
  const lookup = substanceBySlug instanceof Map ? substanceBySlug : new Map(Object.entries(substanceBySlug));
  const normalizedFromSlug = fromSubstanceSlug?.trim() || undefined;
  const href = normalizedFromSlug ? `/${normalizedFromSlug}` : "/reports";
  const backToSubstance = getBackSubstanceName({ report, lookup, fromSubstanceSlug: normalizedFromSlug });

  return {
    href,
    label: backToSubstance ? `Back to ${backToSubstance}` : "Back to Reports",
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

function sortGroupEntries<TReport>(
  groups: Record<string, TReport[]>,
  direction: ReportSortDirection,
): Array<[string, TReport[]]> {
  return Object.entries(groups).sort(([a], [b]) =>
    direction === "asc" ? a.localeCompare(b) : b.localeCompare(a),
  );
}
