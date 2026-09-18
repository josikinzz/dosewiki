import type {
  PublicGalleryReplicationPreview,
  ReplicationArtistTypeTag,
  ReplicationContentFamily,
  ReplicationDrugClass,
  ReplicationViewingModeTag,
} from "@/types/replications";

export type GalleryMode = "artist" | "effect" | "year";
export type GalleryTypeFilter = "all" | "image" | "video" | "audio";
/** A year rail key: a year, merged span, or `undated`. */
export type GalleryYearFilter = "all" | string;
export const UNDATED_YEAR_FILTER = "undated";
export type GalleryOrder = "curated" | "newest" | "oldest";
export type GalleryViewingFilter = "all" | ReplicationViewingModeTag;
export type GalleryArtistTypeFilter = "all" | ReplicationArtistTypeTag;
export type GalleryDrugFilter = "all" | string;
export type GalleryDrugClassFilter = "all" | ReplicationDrugClass;
export type GalleryContentFamilyFilter = "all" | ReplicationContentFamily;
export type GalleryEffectFilter = "all" | string;

export interface GalleryTaxonomyFilterState {
  viewing: GalleryViewingFilter;
  artistType: GalleryArtistTypeFilter;
  effect: GalleryEffectFilter;
  drug: GalleryDrugFilter;
  drugClass: GalleryDrugClassFilter;
  family: GalleryContentFamilyFilter;
}

export const DEFAULT_GALLERY_TAXONOMY_FILTERS: GalleryTaxonomyFilterState = {
  viewing: "all",
  artistType: "all",
  effect: "all",
  drug: "all",
  drugClass: "all",
  family: "all",
};

export function defaultGalleryOrder(mode: GalleryMode): GalleryOrder {
  return mode === "effect" ? "curated" : "newest";
}

/** Artist rails revealed per "Show more artists" page. */
export const ARTIST_RAIL_PAGE = 16;
/** Items shown inline in a rail before "View all" takes over. */
export const RAIL_PREVIEW_LIMIT = 14;

export interface GalleryGroup {
  key: string;
  label: string;
  href?: string;
  externalUrl?: string;
  count: number;
  imageCount: number;
  videoCount: number;
  audioCount: number;
  approvedReplicator?: boolean;
  creditKeys?: string[];
  items: PublicGalleryReplicationPreview[];
}

export interface GalleryCounts {
  total: number;
  artists: number;
  effects: number;
  images: number;
  videos: number;
}
