import { parseUiLocale } from "@/i18n/messages";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { buildGalleryBrowseUrl, parseGalleryBrowseState, type GalleryBrowseState, type GalleryFocus } from "./galleryUrlState";

export interface GalleryGroupSummary {
  key: string;
  label: string;
  count: number;
  imageCount: number;
  videoCount: number;
  itemIds?: string[];
}
export interface GalleryFacets {
  drugs: Array<{ value: string; label: string }>;
  effects: Array<{ value: string; label: string }>;
}
export interface GalleryPageState {
  queryIdentity: string;
  total: number;
  nextCursor: string | null;
  groups: GalleryGroupSummary[];
  facets: GalleryFacets;
}
export interface GalleryPagePayload extends GalleryPageState {
  data: PublicGalleryReplicationPreview[];
  contributorDirectory?: ContributorDirectory;
}

export function galleryQueryIdentity(locale: string, browse: GalleryBrowseState, focus?: GalleryFocus | null): string {
  const normalized = parseGalleryBrowseState(new URLSearchParams(buildGalleryBrowseUrl(browse).split("?")[1]));
  return JSON.stringify([parseUiLocale(locale), normalized, focus ? { kind: focus.kind, key: focus.key } : null]);
}
