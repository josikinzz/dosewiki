"use client";

import { memo, useMemo } from "react";

import { getCreatorByline, hasKnownCreator } from "./replicationCredit";
import { artistPageHrefForWork } from "@/features/replications/galleryFocus";
import { ReplicationShowcase } from "@/features/replications/components/ReplicationShowcase";
import {
  SHOWCASE_WORK_CAP,
  type ShowcaseWork,
} from "@/features/replications/components/showcaseModel";
import type { ReplicationWithUrl } from "@/types/replications";

interface ReplicationGalleryProps {
  galleryOrder?: string[];
  replications: ReplicationWithUrl[];
  effectSlug?: string;
}

/**
 * Effect articles use the same compact showcase and expanded viewer as
 * substance articles. The owning effect controls the playlist identity; the
 * work permalink remains available through modified clicks and new tabs.
 */
export const ReplicationGallery = memo(function ReplicationGallery({
  galleryOrder,
  replications,
  effectSlug,
}: ReplicationGalleryProps) {
  const sortedReplications = useMemo(() => {
    if (galleryOrder && galleryOrder.length > 0) {
      const orderMap = new Map(
        galleryOrder.map((slug, index) => [slug, index]),
      );
      return [...replications].sort((a, b) => {
        const aIndex = orderMap.get(a.slug) ?? Number.POSITIVE_INFINITY;
        const bIndex = orderMap.get(b.slug) ?? Number.POSITIVE_INFINITY;
        return aIndex - bIndex;
      });
    }
    return replications;
  }, [galleryOrder, replications]);

  const works = useMemo<ShowcaseWork[]>(() => {
    const drawable = sortedReplications.filter(
      (
        replication,
      ): replication is ReplicationWithUrl & { type: "image" | "video" } =>
        replication.type === "image" || replication.type === "video",
    );
    return drawable.map((replication) => {
      const artistName = hasKnownCreator(replication.artist)
        ? replication.artist.trim()
        : null;
      const internalArtistHref = artistPageHrefForWork(replication);
      const artistHref =
        internalArtistHref ??
        (artistName ? replication.artist_url?.trim() || null : null);
      const resolvedEffectSlug = effectSlug ?? replication.effect_slug ?? "";
      return {
        slug: replication.slug,
        title: replication.title,
        type: replication.type,
        url: replication.url,
        thumbnailUrl: replication.thumbnail_url,
        format: replication.format,
        duration: replication.duration,
        width: replication.width,
        height: replication.height,
        previewUrl: replication.preview_url,
        motionUrl: replication.motion_url,
        motionPosterUrl: replication.motion_poster_url,
        byline: getCreatorByline(replication),
        artistName,
        artistHref,
        artistHrefExternal: artistHref !== null && internalArtistHref === null,
        effectSlug: resolvedEffectSlug,
        effectName: resolvedEffectSlug.replace(/-/g, " ") || "Effect",
      };
    });
  }, [effectSlug, sortedReplications]);

  if (works.length === 0) return null;

  return (
    <ReplicationShowcase
      works={works.slice(0, SHOWCASE_WORK_CAP)}
      totalCount={works.length}
      effectSlug={effectSlug}
      collectionLabel={
        effectSlug ? `${effectSlug.replace(/-/g, " ")} replications` : undefined
      }
    />
  );
});
