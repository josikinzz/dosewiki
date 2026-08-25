import {
  getCreatorByline,
  hasKnownCreator,
} from "@/features/effects/components/replicationCredit";
import { artistPageHrefForWork } from "@/features/replications/galleryFocus";
import type { SubstanceGalleryItem } from "@/data/substanceReplicationGallery";
import {
  resolveVisualEffectSlugs,
  visualEffectNamesOf,
} from "@/data/substanceVisualEffects";
import { sortByMediaRank } from "@/features/replications/mediaRank";

import type { ShowcaseWork } from "./showcaseWork";

/**
 * Effect slug → display name, derived from the article's own visual-effect
 * chips. The matcher resolved these exact names to slugs (T1), so inverting
 * that resolution names each provenance slug with the same words the reader
 * just scrolled past — not a re-derived label that could disagree with the
 * chips. First name wins when two chips resolve to one effect.
 */
export function visualEffectNameBySlug(
  subjectiveEffects: unknown,
): ReadonlyMap<string, string> {
  const names = visualEffectNamesOf(subjectiveEffects);
  const { slugByName } = resolveVisualEffectSlugs(names);
  const bySlug = new Map<string, string>();
  for (const [name, slug] of slugByName) {
    if (!bySlug.has(slug)) bySlug.set(slug, name);
  }
  return bySlug;
}

/**
 * Flatten the public per-substance read into stage-ready works: audio-first
 * media rank leads (sounded videos, then silent motion, then stills), and the
 * order the read delivered (curated head, then default tail) survives within
 * each rank. Rows the stage cannot draw (audio) drop out; a slug the article
 * names nowhere falls back to the gallery's humanised-slug convention.
 */
export function buildShowcaseWorks(
  items: readonly SubstanceGalleryItem[],
  effectNameBySlug: ReadonlyMap<string, string>,
  resolveArtistFallbackHref: (artistName: string) => string | null = () => null,
  resolveArtistAvatarUrl: (artistName: string) => string | null = () => null,
): ShowcaseWork[] {
  const works: ShowcaseWork[] = [];
  const ranked = sortByMediaRank(items, (item) => item.replication);
  for (const { replication, provenance } of ranked) {
    if (replication.type !== "video" && replication.type !== "image") continue;
    const artistName = hasKnownCreator(replication.artist)
      ? replication.artist.trim()
      : null;
    const internalHref =
      artistPageHrefForWork(replication) ??
      (artistName ? resolveArtistFallbackHref(artistName) : null);
    const artistHref =
      internalHref ??
      (artistName ? replication.artist_url?.trim() || null : null);
    works.push({
      slug: replication.slug,
      title: replication.title,
      type: replication.type,
      url: replication.url,
      thumbnailUrl: replication.thumbnail_url,
      format: replication.format,
      duration: replication.duration,
      hasAudio: replication.has_audio,
      width: replication.width,
      height: replication.height,
      previewUrl: replication.preview_url,
      motionUrl: replication.motion_url,
      motionPosterUrl: replication.motion_poster_url,
      byline: getCreatorByline(replication),
      artistName,
      artistHref,
      artistHrefExternal: artistHref !== null && internalHref === null,
      avatarUrl: artistName ? resolveArtistAvatarUrl(artistName) : null,
      effectSlug: provenance.effectSlug,
      effectName:
        effectNameBySlug.get(provenance.effectSlug) ??
        provenance.effectSlug.replace(/-/g, " "),
    });
  }
  return works;
}
