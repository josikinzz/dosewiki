/**
 * View model for the Trip Report Portal (`/dev` → Trip reports).
 *
 * The tool it replaces indexed only the intake queue, which made the published
 * corpus invisible from the editor surface that is supposed to own it. This
 * module is the "one corpus, two origins" decision in code: a published
 * `tripReports` row and a `tripReportSubmissions` row become the same
 * `PortalRow`, differing in status and in what may be done to them, so browsing,
 * faceting, and grouping never have to ask which table a report came from.
 *
 * Everything here is pure. The tab owns fetching and React state; this owns what
 * the editor sees.
 */
import { groupTripReports } from "@/features/reports/domain/tripReportIndex";
import type { ReportViewMode } from "@/types/tripReport";
import type {
  TripReportEditableFields,
  TripReportEditableSubstance,
} from "../../../../../server/lib/tripReportEditing";

type TripReportSubmissionStatus =
  | "submitted"
  | "reviewing"
  | "accepted"
  | "rejected"
  | "spam"
  | "exported";

/**
 * Submission states that are asking for an editor. The badge on the dev tab and
 * the "Needs review" bucket are the same question, so they read the same list.
 */
export const NEEDS_REVIEW_SUBMISSION_STATUSES = ["submitted", "reviewing"] as const;

/** A name the byline picker can offer, and the key that attributes it. */
export type PortalContributorOption = { key: string; displayName: string };

export type PortalBucket = "needs" | "published" | "all";

export type PortalStatusKind = "needs" | "published" | "accepted" | "rejected";

export type PortalSort = "newest" | "oldest" | "title";

export type PortalGroupBy = "substance" | "author" | "date" | "none";

export type PortalFacetKind = "substance" | "author" | "tag";

export type PortalFacets = Record<PortalFacetKind, string[]>;

export const EMPTY_PORTAL_FACETS: PortalFacets = { substance: [], author: [], tag: [] };

/**
 * The byline facts an index row carries.
 *
 * A published row's index projection and a queued submission both stop here: the
 * rest of a subject (age, setting, medications…) belongs to the editor form,
 * which reads it from the report body fetched on selection.
 */
type PortalSubjectSummary = { name: string; trip_date?: string };

export type PortalRow = {
  /** Postgres document id for a published report, public submission id otherwise. */
  id: string;
  origin: "published" | "submission";
  /** Stable key for grouping; a submission has no public URL of its own. */
  slug: string;
  publicSlug: string | null;
  title: string;
  featured: boolean;
  subject: PortalSubjectSummary;
  substances: TripReportEditableSubstance[];
  tags: string[];
  status: TripReportSubmissionStatus | "published";
  statusKind: PortalStatusKind;
  /** Trip date when known, else the date the row entered the system. */
  sortDate: string;
  /**
   * Editable slice. Null on a submission, and null on a published row until the
   * body has been fetched for the open editor — the index never carries it.
   */
  fields: TripReportEditableFields | null;
  profileKey: string | null;
  license: string | null;
  attributionReviewed: boolean;
};

export const PORTAL_STATUS_LABELS: Record<PortalStatusKind, string> = {
  needs: "Needs review",
  published: "Published",
  accepted: "Accepted",
  rejected: "Not published",
};

export function isNeedsReviewStatus(status: string): boolean {
  return (NEEDS_REVIEW_SUBMISSION_STATUSES as readonly string[]).includes(status);
}

function statusKindOf(status: PortalRow["status"]): PortalStatusKind {
  if (status === "published" || status === "exported") {
    return "published";
  }

  if (isNeedsReviewStatus(status)) {
    return "needs";
  }

  return status === "accepted" ? "accepted" : "rejected";
}

/**
 * The index projection `getPortalRows` returns: everything the list, the search,
 * the facets and the stats read, and nothing else. The report body is fetched
 * separately when a row is opened.
 */
export type PublishedReportPayload = {
  id: string;
  slug: string;
  title: string;
  subject: PortalSubjectSummary;
  substances: TripReportEditableSubstance[];
  tags: string[];
  featured: boolean;
  license?: string | null;
  profileKey?: string | null;
  attributionReview?: unknown;
  createdAt: number;
};

export function toPortalRowFromReport(report: PublishedReportPayload): PortalRow {
  return {
    id: report.id,
    origin: "published",
    slug: report.slug,
    publicSlug: report.slug,
    title: report.title,
    featured: report.featured,
    subject: report.subject,
    substances: report.substances,
    tags: report.tags,
    status: "published",
    statusKind: "published",
    sortDate: report.subject.trip_date ?? isoDate(report.createdAt),
    fields: null,
    profileKey: report.profileKey ?? null,
    license: report.license ?? null,
    attributionReviewed: Boolean(report.attributionReview),
  };
}

export type SubmissionRowPayload = {
  id: string;
  status: TripReportSubmissionStatus;
  title: string;
  author_name: string;
  created_at: string;
  report: {
    subject: { name: string; trip_date?: string };
    substances: TripReportEditableSubstance[];
    tags: string[];
  };
};

export function toPortalRowFromSubmission(submission: SubmissionRowPayload): PortalRow {
  return {
    id: submission.id,
    origin: "submission",
    // Namespaced so a submission can never collide with a published slug in a
    // selection key or a group bucket.
    slug: `submission:${submission.id}`,
    publicSlug: null,
    title: submission.title,
    featured: false,
    subject: submission.report.subject,
    substances: submission.report.substances,
    tags: submission.report.tags,
    status: submission.status,
    statusKind: statusKindOf(submission.status),
    sortDate: submission.report.subject.trip_date ?? submission.created_at.slice(0, 10),
    fields: null,
    profileKey: null,
    license: null,
    attributionReviewed: false,
  };
}

function isoDate(timestamp: number): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Buckets, not a status dropdown.
 *
 * Editors think in "what needs me" / "what's live" / "everything". The six
 * submission states still exist underneath: an accepted-but-unpromoted row and
 * a rejected one both fall outside the first two buckets and are only reachable
 * from "All", which is the honest place for them.
 */
export function bucketOf(row: PortalRow): PortalBucket | "other" {
  if (row.statusKind === "needs") {
    return "needs";
  }

  return row.statusKind === "published" ? "published" : "other";
}

export function countBucket(rows: readonly PortalRow[], bucket: PortalBucket): number {
  return bucket === "all" ? rows.length : rows.filter((row) => bucketOf(row) === bucket).length;
}

export function rowMatchesQuery(row: PortalRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystack = [
    row.title,
    row.subject.name,
    ...row.substances.map((substance) => substance.name),
    ...row.tags,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

function rowFacetValues(row: PortalRow, kind: PortalFacetKind): string[] {
  if (kind === "substance") {
    return row.substances.map((substance) => substance.name);
  }

  return kind === "author" ? [row.subject.name] : row.tags;
}

export function toggleFacetValue(facets: PortalFacets, kind: PortalFacetKind, value: string): PortalFacets {
  const current = facets[kind];
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];

  return { ...facets, [kind]: next };
}

export function activeFacetCount(facets: PortalFacets): number {
  return facets.substance.length + facets.author.length + facets.tag.length;
}

export type PortalFacetEntry = { value: string; count: number };

/**
 * Facet counts are computed over the corpus, not over the filtered list, so
 * ticking one substance does not make every other substance read as empty.
 */
export function countFacet(rows: readonly PortalRow[], kind: PortalFacetKind): PortalFacetEntry[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const value of rowFacetValues(row, kind)) {
      if (!value) {
        continue;
      }

      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

export type PortalQuery = {
  bucket: PortalBucket;
  query: string;
  facets: PortalFacets;
  sort: PortalSort;
};

export function filterPortalRows(rows: readonly PortalRow[], request: PortalQuery): PortalRow[] {
  const filtered = rows.filter((row) => {
    if (request.bucket !== "all" && bucketOf(row) !== request.bucket) {
      return false;
    }

    if (!rowMatchesQuery(row, request.query)) {
      return false;
    }

    return (["substance", "author", "tag"] as const).every((kind) => {
      const selected = request.facets[kind];
      if (selected.length === 0) {
        return true;
      }

      const values = rowFacetValues(row, kind);
      return selected.some((value) => values.includes(value));
    });
  });

  return sortPortalRows(filtered, request.sort);
}

export function sortPortalRows(rows: readonly PortalRow[], sort: PortalSort): PortalRow[] {
  const sorted = [...rows];

  sorted.sort((left, right) => {
    if (sort === "title") {
      return left.title.localeCompare(right.title);
    }

    const comparison = left.sortDate.localeCompare(right.sortDate);
    return sort === "oldest" ? comparison : -comparison;
  });

  return sorted;
}

export type PortalGroup = { name: string | null; rows: PortalRow[] };

const GROUP_BY_TO_VIEW_MODE: Partial<Record<PortalGroupBy, ReportViewMode>> = {
  substance: "substance",
  author: "author",
};

/**
 * Grouping defers to `groupTripReports`, the engine the public reports index
 * already uses, so the portal buckets combinations and orders substance groups
 * the same way the public surface does. Only the ordering *inside* each group is
 * overridden: that engine sorts by title, and the portal has its own sort
 * control the editor expects to be obeyed.
 */
export function groupPortalRows(
  rows: readonly PortalRow[],
  groupBy: PortalGroupBy,
  sort: PortalSort,
): PortalGroup[] {
  if (groupBy === "none") {
    return [{ name: null, rows: [...rows] }];
  }

  if (groupBy === "date") {
    const byYear = new Map<string, PortalRow[]>();
    for (const row of rows) {
      const year = row.sortDate.slice(0, 4) || "Undated";
      const bucket = byYear.get(year);
      if (bucket) {
        bucket.push(row);
      } else {
        byYear.set(year, [row]);
      }
    }

    return Array.from(byYear.entries())
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([name, groupRows]) => ({ name, rows: sortPortalRows(groupRows, sort) }));
  }

  const viewMode = GROUP_BY_TO_VIEW_MODE[groupBy] ?? "substance";
  return groupTripReports([...rows], viewMode, "asc", "count").map((group) => ({
    name: group.name,
    rows: sortPortalRows(group.reports, sort),
  }));
}

export type PortalStats = { reports: number; authors: number; substances: number };

export function portalStats(rows: readonly PortalRow[]): PortalStats {
  const authors = new Set<string>();
  const substances = new Set<string>();

  for (const row of rows) {
    if (row.subject.name) {
      authors.add(row.subject.name);
    }

    for (const substance of row.substances) {
      if (substance.name) {
        substances.add(substance.name);
      }
    }
  }

  return { reports: rows.length, authors: authors.size, substances: substances.size };
}
