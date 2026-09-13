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
import {
  isVisualReplication,
  type ReplicationWithUrl,
} from "@/types/replications";
import { applyCuratedOrder } from "@server/curatedOrder";

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
 * Flatten the public per-substance read into stage-ready works. Audio-first
 * media rank leads within the policy collection, but Visual Disconnection
 * fallback stills remain a final band even when one uses a motion-capable GIF
 * container. Rows the stage cannot draw (audio) drop out; a slug the article
 * names nowhere falls back to the gallery's humanised-slug convention.
 */
export function buildShowcaseWorks(
  items: readonly SubstanceGalleryItem[],
  effectNameBySlug: ReadonlyMap<string, string>,
  resolveArtistFallbackHref: (artistName: string) => string | null = () => null,
  resolveArtistAvatarUrl: (artistName: string) => string | null = () => null,
): ShowcaseWork[] {
  const works: ShowcaseWork[] = [];
  const primary = items.filter((item) => item.provenance.matchedVia !== "visual_disconnection");
  const fallback = items.filter((item) => item.provenance.matchedVia === "visual_disconnection");
  const ranked = [
    ...sortByMediaRank(primary, (item) => item.replication),
    ...sortByMediaRank(fallback, (item) => item.replication),
  ];
  for (const { replication, provenance } of ranked) {
    if (!isVisualReplication(replication)) continue;
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

/**
 * Flatten an effect's public replication rows into stage-ready works, in the
 * order the effect article has always shown them: the editor's curated order
 * over the audio-first media rank, with rows the stage cannot draw (audio)
 * dropped afterwards so curation indexes stay aligned with the full corpus.
 * The effect path deliberately performs no contributor-profile fallback or
 * avatar lookup — parity with the client gallery it replaced: a byline links
 * the Artist Page when the work proves one exists, else the credit's own
 * site, else nowhere.
 */
export function buildEffectShowcaseWorks(
  replications: readonly ReplicationWithUrl[],
  opts: {
    effectSlug?: string;
    effectName?: string;
    galleryOrder?: readonly string[];
  } = {},
): ShowcaseWork[] {
  const { effectSlug, effectName, galleryOrder } = opts;
  const ordered = applyCuratedOrder(
    sortByMediaRank(replications, (replication) => replication),
    galleryOrder,
    (replication) => replication.slug,
  );
  const drawable = ordered.filter(isVisualReplication);
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
      hasAudio: replication.has_audio,
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
      effectName:
        effectName ?? (resolvedEffectSlug.replace(/-/g, " ") || "Effect"),
    };
  });
}
