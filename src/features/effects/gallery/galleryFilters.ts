import { depictsEffect } from "@/types/replications";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { workDateMs } from "./galleryOrdering";
import {
  UNDATED_YEAR_FILTER,
  type GalleryTaxonomyFilterState,
  type GalleryTypeFilter,
  type GalleryYearFilter,
} from "./galleryTypes";

export function matchesType(
  replication: PublicGalleryReplicationPreview,
  filter: GalleryTypeFilter,
): boolean {
  return filter === "all" || replication.type === filter;
}

export function matchesYear(
  replication: Pick<PublicGalleryReplicationPreview, "date_info">,
  filter: GalleryYearFilter,
): boolean {
  if (filter === "all") return true;
  const ms = workDateMs(replication);
  if (filter === UNDATED_YEAR_FILTER) return ms === null;
  if (ms === null) return false;
  const year = new Date(ms).getUTCFullYear();
  const [from, to] = filter.split("-");
  const start = Number(from);
  const end = to === undefined ? start : Number(to);
  return year >= start && year <= end;
}

export function matchesTaxonomyFilters(
  replication: PublicGalleryReplicationPreview,
  filters: GalleryTaxonomyFilterState,
): boolean {
  return (
    (filters.viewing === "all" || replication.viewing_mode_tags?.includes(filters.viewing) === true) &&
    (filters.artistType === "all" || replication.artist_type_tags?.includes(filters.artistType) === true) &&
    (filters.effect === "all" || depictsEffect(replication, filters.effect)) &&
    (filters.drug === "all" || replication.title_drugs?.some((drug) => drug.slug === filters.drug) === true) &&
    (filters.drugClass === "all" || replication.drug_classes?.includes(filters.drugClass) === true) &&
    (filters.family === "all" || replication.content_family === filters.family)
  );
}

export function countActiveTaxonomyFilters(filters: GalleryTaxonomyFilterState): number {
  return Object.values(filters).filter((value) => value !== "all").length;
}

export function matchesQuery(
  replication: PublicGalleryReplicationPreview,
  query: string,
  effectName: (slug: string) => string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    replication.title,
    replication.artist,
    replication.effect_slug ? effectName(replication.effect_slug) : undefined,
    replication.effect_slug,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
