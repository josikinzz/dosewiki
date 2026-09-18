import "server-only";
import { createHash, randomUUID } from "node:crypto";

import { getPublicReports } from "@server/data/publicData";
import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, PUBLIC_DATA_CACHE_TAGS } from "@server/data/publicData.cache";
import { getLocalizedLeaves, getLocalizedLeavesRevision } from "@server/translation/localizedRecords";
import { segmentHash } from "../../scripts/translation/segment-manifest.mjs";
import { foldSparseGroups, groupTripReports, selectFeaturedReports, selectRecentlyAddedReports } from "../../src/features/reports/domain/tripReportIndex";
import { DEFAULT_SORT_ID, SORT_OPTIONS, type ReportBrowsePage, type ReportBrowseQuery } from "../../src/features/reports/domain/reportBrowsePage";
import { toReportCardModel, type ReportCardModel } from "../../src/types/tripReport";

// Matches the existing open-shelf ceiling. Recalibrate against matched route measurements.
export const REPORT_BROWSE_PAGE_SIZE = 24;

type CorpusFacets = Pick<ReportBrowsePage, "total" | "authorCount" | "substanceOptions" | "featured" | "recentlyAdded">;
interface Membership {
  ordered: { group: ReportBrowsePage["groups"][number]; report: ReportCardModel }[];
  groupFacets: ReportBrowsePage["groupFacets"];
  filteredTotal: number;
  scope: string;
}
interface BrowseIndex {
  reports: ReportCardModel[];
  facets: CorpusFacets;
  memberships: Map<string, Membership>;
}
interface CanonicalIndex extends BrowseIndex {
  titles: string[];
  translationHashes: string[];
}

const sourceRevision = publicDataCache(async () => randomUUID(), ["public-report-index-revision-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.reports, PUBLIC_DATA_CACHE_TAGS.contributors],
});
let canonicalCache: { revision: string; value: Promise<CanonicalIndex> } | undefined;
let localizedCache: { revision: string; value: Promise<BrowseIndex> } | undefined;

function buildIndex(reports: ReportCardModel[]): BrowseIndex {
  const counts = new Map<string, number>();
  for (const report of reports) {
    for (const name of new Set(report.substances.map((entry) => entry.name.trim()).filter(Boolean))) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return {
    reports,
    facets: {
      total: reports.length,
      authorCount: new Set(reports.map((report) => report.subject.name)).size,
      substanceOptions: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
      featured: selectFeaturedReports(reports, 5),
      recentlyAdded: selectRecentlyAddedReports(reports, 5),
    },
    memberships: new Map(),
  };
}

function selectMembership(index: BrowseIndex, input: ReportBrowseQuery, locale: string | null): Membership {
  const sort = SORT_OPTIONS.find((option) => option.id === input.sortId) ?? SORT_OPTIONS.find((option) => option.id === DEFAULT_SORT_ID)!;
  const query = input.query?.trim().toLowerCase() ?? "";
  const substance = input.substance?.trim() || null;
  const key = JSON.stringify([locale, input.view, sort.id, substance, query]);
  const existing = index.memberships.get(key);
  if (existing) return existing;
  const { reports } = index;
  const filtered = reports.filter((report) => (!substance || report.substances.some((entry) => entry.name.trim() === substance)) && (!query || [report.title, report.subject.name, ...report.substances.map((entry) => entry.name)].some((value) => value.toLowerCase().includes(query))));
  // Give equal titles/dates a deterministic identity tie-break before the stable grouping sorts.
  let groups = groupTripReports([...filtered].sort((a, b) => a.slug.localeCompare(b.slug)), input.view, sort.direction, sort.key);
  if (input.view === "substance") {
    groups = foldSparseGroups(groups);
    const grouped = new Set(groups.flatMap((group) => group.reports.map((report) => report.slug)));
    const ungrouped = filtered.filter((report) => !grouped.has(report.slug));
    if (ungrouped.length) groups.push({ name: "Other reports", anchor: "substance-unclassified", kind: "mixed", reports: ungrouped.sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug)) });
  }
  const ordered = groups.flatMap((group) => group.reports.map((report) => ({ group, report })));
  const revision = createHash("sha256").update(JSON.stringify(ordered.map(({ group, report }) => [group.anchor, report.slug]))).digest("hex");
  const scope = JSON.stringify([locale, input.view, sort.id, substance, query, revision]);
  const membership = {
    ordered, scope, filteredTotal: filtered.length,
    groupFacets: groups.map(({ name, anchor, reports: groupReports }) => ({ name, anchor, count: groupReports.length })),
  };
  if (index.memberships.size >= 32) index.memberships.delete(index.memberships.keys().next().value!);
  index.memberships.set(key, membership);
  return membership;
}

function selectPage(index: BrowseIndex, input: ReportBrowseQuery, locale: string | null): ReportBrowsePage {
  const { ordered, scope, groupFacets, filteredTotal } = selectMembership(index, input, locale);
  let start = 0;
  if (input.cursor) {
    let cursor: unknown;
    try { cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString()); } catch { throw new Error("Invalid report cursor"); }
    if (!Array.isArray(cursor) || cursor.length !== 3 || cursor[0] !== scope) throw new Error("Invalid report cursor");
    const previous = ordered.findIndex(({ group, report }) => group.anchor === cursor[1] && report.slug === cursor[2]);
    if (previous < 0) throw new Error("Report cursor has expired");
    start = previous + 1;
  }
  const selected = ordered.slice(start, start + REPORT_BROWSE_PAGE_SIZE);
  const pageGroups: ReportBrowsePage["groups"] = [];
  for (const { group, report } of selected) {
    const previous = pageGroups[pageGroups.length - 1];
    if (previous?.anchor === group.anchor) previous.reports.push(report);
    else pageGroups.push({ ...group, reportCount: group.reports.length, reports: [report] });
  }
  const last = selected[selected.length - 1];
  return {
    ...index.facets,
    groups: pageGroups,
    groupFacets,
    nextCursor: last && start + selected.length < ordered.length ? Buffer.from(JSON.stringify([scope, last.group.anchor, last.report.slug])).toString("base64url") : null,
    filteredTotal,
  };
}

export function projectReportBrowsePage(reports: ReportCardModel[], input: ReportBrowseQuery, locale: string | null = null): ReportBrowsePage {
  return selectPage(buildIndex(reports), input, locale);
}

export async function getReportBrowsePage(input: ReportBrowseQuery, locale: string | null = null): Promise<ReportBrowsePage> {
  const revision = await sourceRevision();
  if (canonicalCache?.revision !== revision) {
    const value = (async (): Promise<CanonicalIndex> => {
      const reports = await getPublicReports();
      const titles = [...new Set(reports.map((report) => report.title))];
      return { ...buildIndex(reports.map(toReportCardModel)), titles, translationHashes: titles.map(segmentHash) };
    })();
    const entry = { revision, value };
    canonicalCache = entry;
    void value.catch(() => { if (canonicalCache === entry) canonicalCache = undefined; });
  }
  const canonical = await canonicalCache.value;
  if (!locale) return selectPage(canonical, input, locale);

  const translationRevision = await getLocalizedLeavesRevision(locale, canonical.translationHashes);
  const localizedRevision = JSON.stringify([revision, locale, translationRevision]);
  if (localizedCache?.revision !== localizedRevision) {
    const value = (async () => {
      const titles = await getLocalizedLeaves(canonical.titles, locale);
      return buildIndex(canonical.reports.map((report) => ({ ...report, title: titles.get(report.title) ?? report.title })));
    })();
    const entry = { revision: localizedRevision, value };
    localizedCache = entry;
    void value.catch(() => { if (localizedCache === entry) localizedCache = undefined; });
  }
  return selectPage(await localizedCache.value, input, locale);
}
