import type { ReplicationType, ReplicationWithUrl } from "@/types/replications";
import type {
  GalleryGroup,
  GalleryMode,
} from "@/features/effects/gallery/galleryTypes";
import { artistPageHrefForWork } from "@/features/replications/galleryFocus";
import type { EffectCategoryLink } from "@/features/effects/pages/replicationSubject";
import type { ShowcaseWork } from "../components/showcaseWork";
import { hasKnownCreator } from "@/features/effects/components/replicationCredit";
import { msg } from "@/i18n/messages";

type ReplicationViewerScope = "artist" | "effect" | "substance"

export interface ReplicationViewerItem {
  replication: ReplicationWithUrl;
  effectName: string | null;
  effectSlug: string | null;
  effectCategories: EffectCategoryLink[];
  artistProfileHref: string | null;
  avatarUrl: string | null;
}

interface ReplicationViewerMedia { slug: string;
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
has_audio?: boolean; }

export interface ReplicationViewerMediaItem extends Omit<
  ReplicationViewerItem,
  "replication"
> {
  replication: ReplicationViewerMedia;
}

type ReplicationViewerCollectionKind = | ReplicationViewerScope
| "gallery"
type ReplicationViewerGrouping = "none" | "artist" | "effect" | "year"

interface ReplicationViewerEditableTarget { kind: ReplicationViewerScope;
key: string;
label: string;
updatedAt?: string | null; }

interface ReplicationViewerGroup { key: string;
label: string;
items: ReplicationViewerMediaItem[]; }

export interface ReplicationViewerCollection {
  sourcePath: string;
  label: string;
  kind: ReplicationViewerCollectionKind;
  grouping: ReplicationViewerGrouping;
  groups: ReplicationViewerGroup[];
  editorTarget?: ReplicationViewerEditableTarget;
}

export interface ReplicationViewerPosition {
  groupIndex: number;
  itemIndex: number;
}

export type ReplicationViewerDirection = -1 | 1;

export function viewerItemFromShowcaseWork(work: ShowcaseWork): ReplicationViewerMediaItem {
  return {
    replication: {
      slug: work.slug,
      title: work.title,
      artist: hasKnownCreator(work.artistName) ? work.artistName!.trim() : msg("Unattributed"),
      type: work.type,
      format: work.format ?? (work.type === "video" ? "mp4" : "image"),
      url: work.url,
      thumbnail_url: work.thumbnailUrl,
      preview_url: work.previewUrl,
      motion_url: work.motionUrl,
      motion_poster_url: work.motionPosterUrl,
      width: work.width,
      height: work.height,
      duration: work.duration,
      has_audio: work.hasAudio,
    },
    effectName: work.effectName,
    effectSlug: work.effectSlug,
    effectCategories: [],
    artistProfileHref:
      hasKnownCreator(work.artistName) && !work.artistHrefExternal
        ? work.artistHref
        : null,
    avatarUrl: work.avatarUrl ?? null,
  };
}

export function findViewerPosition(
  collection: ReplicationViewerCollection,
  slug: string,
): ReplicationViewerPosition | null {
  let fallback: ReplicationViewerPosition | null = null;
  for (
    let groupIndex = 0;
    groupIndex < collection.groups.length;
    groupIndex += 1
  ) {
    const group = collection.groups[groupIndex];
    const itemIndex = group.items.findIndex(
      (item) => item.replication.slug === slug,
    );
    if (itemIndex < 0) continue;
    const position = { groupIndex, itemIndex };
    if (
      collection.grouping !== "effect" ||
      group.key === group.items[itemIndex].effectSlug
    ) {
      return position;
    }
    fallback ??= position;
  }
  return fallback;
}

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

export function viewerCollectionFromGalleryGroups(
  groups: readonly GalleryGroup[],
  grouping: GalleryMode,
  sourcePath: string,
  effectNameBySlug: (slug: string) => string = (slug) =>
    slug.replace(/-/g, " "),
  avatarByArtist: (artist: string) => string | null = () => null,
): ReplicationViewerCollection {
  return {
    sourcePath,
    label:
      grouping === "artist"
        ? msg("Sorted by artist")
        : grouping === "year"
          ? msg("Sorted by year")
          : msg("Sorted by effect"),
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
        avatarUrl: avatarByArtist(replication.artist ?? ""),
      })),
    })),
  };
}
