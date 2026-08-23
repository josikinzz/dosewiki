import type { ReplicationType, ReplicationWithUrl } from "@/types/replications";
import type {
  GalleryGroup,
  GalleryMode,
} from "@/features/effects/gallery/galleryModel";
import { artistPageHrefForWork } from "@/features/replications/galleryFocus";
import type { EffectCategoryLink } from "@/features/effects/pages/replicationSubject";

/**
 * Canonical collection model shared by gallery, article, and artist sources.
 * A collection preserves the source page and its visible grouping so the
 * overlay can navigate without inventing a second route-level playlist.
 */

/** Which body of work the viewer is walking. */
export type ReplicationViewerScope = "artist" | "effect" | "substance";

export interface ReplicationViewerItem {
  replication: ReplicationWithUrl;
  effectName: string | null;
  effectSlug: string | null;
  effectCategories: EffectCategoryLink[];
  /**
   * The credited artist's Artist Page (their contributor profile only for a
   * work withheld from artist views), null when the credit names nobody.
   */
  artistProfileHref: string | null;
  /**
   * The claiming Contributor Profile's avatar, rendered beside the compact
   * byline; null when no profile claims the credit or the profile has none.
   */
  avatarUrl: string | null;
}

export interface ReplicationViewerMedia {
  slug: string;
  title: string;
  artist: string;
  type: ReplicationType;
  format: string;
  url: string;
  thumbnail_url?: string;
  preview_url?: string;
  motion_url?: string;
  motion_poster_url?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface ReplicationViewerMediaItem extends Omit<
  ReplicationViewerItem,
  "replication"
> {
  replication: ReplicationViewerMedia;
}

export type ReplicationViewerCollectionKind =
  | ReplicationViewerScope
  | "gallery";
export type ReplicationViewerGrouping = "none" | "artist" | "effect";

export interface ReplicationViewerGroup {
  key: string;
  label: string;
  items: ReplicationViewerMediaItem[];
}

/**
 * The reconstructable collection behind the expanded overlay. Named
 * substance/effect/artist collections have one group; Gallery collections
 * preserve their active artist/effect grouping.
 */
export interface ReplicationViewerCollection {
  sourcePath: string;
  label: string;
  kind: ReplicationViewerCollectionKind;
  grouping: ReplicationViewerGrouping;
  groups: ReplicationViewerGroup[];
}

export interface ReplicationViewerPosition {
  groupIndex: number;
  itemIndex: number;
}

export type ReplicationViewerDirection = -1 | 1;

/** Locate a work in a normalized collection. */
export function findViewerPosition(
  collection: ReplicationViewerCollection,
  slug: string,
): ReplicationViewerPosition | null {
  for (
    let groupIndex = 0;
    groupIndex < collection.groups.length;
    groupIndex += 1
  ) {
    const itemIndex = collection.groups[groupIndex].items.findIndex(
      (item) => item.replication.slug === slug,
    );
    if (itemIndex >= 0) return { groupIndex, itemIndex };
  }
  return null;
}

/** Finite horizontal navigation within the active group. */
export function moveViewerWork(
  collection: ReplicationViewerCollection,
  position: ReplicationViewerPosition,
  direction: ReplicationViewerDirection,
): ReplicationViewerPosition | null {
  const group = collection.groups[position.groupIndex];
  if (!group) return null;
  const itemIndex = position.itemIndex + direction;
  return itemIndex >= 0 && itemIndex < group.items.length
    ? { groupIndex: position.groupIndex, itemIndex }
    : null;
}

/**
 * Finite vertical navigation between Gallery groups. A remembered slug wins
 * when it still belongs to the destination group; first visits start at zero.
 */
export function moveViewerGroup(
  collection: ReplicationViewerCollection,
  position: ReplicationViewerPosition,
  direction: ReplicationViewerDirection,
  rememberedSlugByGroup: Readonly<Record<string, string>> = {},
): ReplicationViewerPosition | null {
  if (collection.grouping === "none") return null;
  const groupIndex = position.groupIndex + direction;
  const group = collection.groups[groupIndex];
  if (!group || group.items.length === 0) return null;
  const rememberedSlug = rememberedSlugByGroup[group.key];
  const rememberedIndex = rememberedSlug
    ? group.items.findIndex((item) => item.replication.slug === rememberedSlug)
    : -1;
  return { groupIndex, itemIndex: rememberedIndex >= 0 ? rememberedIndex : 0 };
}

/** Normalize the Gallery's current artist/effect grouping for the overlay. */
export function viewerCollectionFromGalleryGroups(
  groups: readonly GalleryGroup[],
  grouping: GalleryMode,
  sourcePath: string,
  effectNameBySlug: (slug: string) => string = (slug) =>
    slug.replace(/-/g, " "),
): ReplicationViewerCollection {
  return {
    sourcePath,
    label:
      grouping === "artist"
        ? "Replications by artist"
        : "Replications by effect",
    kind: "gallery",
    grouping,
    groups: groups.map((group) => ({
      key: group.key,
      label: group.label,
      items: group.items.map((replication) => ({
        replication,
        effectName: replication.effect_slug
          ? effectNameBySlug(replication.effect_slug)
          : null,
        effectSlug: replication.effect_slug ?? null,
        effectCategories: [],
        artistProfileHref:
          grouping === "artist"
            ? (group.href ?? null)
            : artistPageHrefForWork(replication),
        avatarUrl: null,
      })),
    })),
  };
}
