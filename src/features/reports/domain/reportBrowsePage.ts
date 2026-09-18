import { msg } from "@/i18n/messages";
import type { ReportCardModel, ReportViewMode } from "@/types/tripReport";
import type { ReportSortDirection, ReportSortKey, TripReportGroup } from "./tripReportIndex";

export const SORT_OPTIONS: { id: string; key: ReportSortKey; direction: ReportSortDirection; label: string }[] = [
  { id: "name-asc", key: "alphabetical", direction: "asc", label: msg("Groups A to Z") },
  { id: "name-desc", key: "alphabetical", direction: "desc", label: msg("Groups Z to A") },
  { id: "count-desc", key: "count", direction: "desc", label: msg("Most reports first") },
  { id: "count-asc", key: "count", direction: "asc", label: msg("Fewest reports first") },
  { id: "date-desc", key: "date", direction: "desc", label: msg("Newest experience first") },
  { id: "date-asc", key: "date", direction: "asc", label: msg("Oldest experience first") },
];
export const DEFAULT_SORT_ID = "name-asc";

export interface ReportBrowsePage {
  groups: TripReportGroup<ReportCardModel>[];
  groupFacets: { name: string; anchor: string; count: number }[];
  nextCursor: string | null;
  total: number;
  filteredTotal: number;
  authorCount: number;
  substanceOptions: { name: string; count: number }[];
  featured: ReportCardModel[];
  recentlyAdded: ReportCardModel[];
}
export interface ReportBrowseQuery {
  view: ReportViewMode;
  sortId?: string;
  substance?: string | null;
  query?: string;
  cursor?: string | null;
}
