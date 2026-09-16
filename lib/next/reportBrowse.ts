import "server-only";
import { createHash } from "node:crypto";

import { getPublicReports } from "@server/data/publicData";
import { getLocalizedLeaves } from "@server/translation/localizedRecords";
import { foldSparseGroups, groupTripReports, selectFeaturedReports, selectRecentlyAddedReports } from "../../src/features/reports/domain/tripReportIndex";
import { DEFAULT_SORT_ID, SORT_OPTIONS, type ReportBrowsePage, type ReportBrowseQuery } from "../../src/features/reports/domain/reportBrowsePage";
import { toReportCardModel, type ReportCardModel } from "../../src/types/tripReport";

// Matches the existing open-shelf ceiling. Recalibrate against matched route measurements.
export const REPORT_BROWSE_PAGE_SIZE = 24;

export function projectReportBrowsePage(reports: ReportCardModel[], input: ReportBrowseQuery, locale: string | null = null): ReportBrowsePage {
  const sort = SORT_OPTIONS.find((option) => option.id === input.sortId) ?? SORT_OPTIONS.find((option) => option.id === DEFAULT_SORT_ID)!;
  const query = input.query?.trim().toLowerCase() ?? "";
  const substance = input.substance?.trim() || null;
  const counts = new Map<string, number>();
  for (const report of reports) {
    for (const name of new Set(report.substances.map((entry) => entry.name.trim()).filter(Boolean))) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
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
    groups: pageGroups,
    groupFacets: groups.map(({ name, anchor, reports: groupReports }) => ({ name, anchor, count: groupReports.length })),
    nextCursor: last && start + selected.length < ordered.length ? Buffer.from(JSON.stringify([scope, last.group.anchor, last.report.slug])).toString("base64url") : null,
    total: reports.length,
    filteredTotal: filtered.length,
    authorCount: new Set(reports.map((report) => report.subject.name)).size,
    substanceOptions: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    featured: selectFeaturedReports(reports, 5),
    recentlyAdded: selectRecentlyAddedReports(reports, 5),
  };
}

export async function getReportBrowsePage(input: ReportBrowseQuery, locale: string | null = null): Promise<ReportBrowsePage> {
  const reports = await getPublicReports();
  const localizedTitles = locale
    ? await getLocalizedLeaves(reports.map(({ title }) => title), locale)
    : null;
  const cards = reports.map((report) => toReportCardModel(localizedTitles
    ? { ...report, title: localizedTitles.get(report.title) ?? report.title }
    : report));
  return projectReportBrowsePage(cards, input, locale);
}
