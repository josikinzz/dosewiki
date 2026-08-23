import {
  getCreatorByline,
  hasKnownCreator,
} from "@/features/effects/components/replicationCredit";
import { artistPageHrefForWork } from "@/features/replications/galleryFocus";
import {
  resolveVisualEffectSlugs,
  visualEffectNamesOf,
  type SubstanceGalleryItem,
} from "@/data/substanceReplicationGallery";

/**
 * One work of the substance article's Replication Showcase, flattened to the
 * serializable fields the client stage needs. Credit and rights lines are
 * composed here with the shared replication-credit helpers so the showcase
 * reads identically to the gallery tiles and the permalink page, and so the
 * client bundle carries strings rather than the whole Convex record.
 */
export type ShowcaseWork = {
  slug: string;
  title: string;
  type: "video" | "image";
  url: string;
  thumbnailUrl?: string;
  format?: string;
  duration?: number;
  width?: number;
  height?: number;
  previewUrl?: string;
  motionUrl?: string;
  motionPosterUrl?: string;
  /** "by <artist>" or "Creator unknown" — never prepend another "by". */
  byline: string;
  /** Trimmed credited name, null when the credit names nobody. */
  artistName: string | null;
  /**
   * Where the artist's name links: their Artist Page when this work proves one
   * exists, else the `resolveArtistFallbackHref` answer (a claimed contributor
   * profile — live for exactly the artists with no page), else their own site
   * (`artist_url`), else nowhere. Same policy as the permalink page's byline.
   */
  artistHref: string | null;
  /** True when `artistHref` leaves the site (the `artist_url` fallback). */
  artistHrefExternal: boolean;
  effectSlug: string;
  effectName: string;
};

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
 * How many works the article showcase renders. The matcher can return the
 * whole per-effect corpus (LSD matches ~90); an inline figure gets the
 * curated head of that list and hands the rest to the gallery. Editors pick
 * *which* works fill these slots via the curation portal's ordering.
 */
export const SHOWCASE_WORK_CAP = 12;

/**
 * Flatten the public per-substance read into stage-ready works, in the order
 * the read delivered (curated head, then default tail). Rows the stage cannot
 * draw (audio) drop out; a slug the article names nowhere falls back to the
 * gallery's humanised-slug convention.
 */
export function buildShowcaseWorks(
  items: readonly SubstanceGalleryItem[],
  effectNameBySlug: ReadonlyMap<string, string>,
  resolveArtistFallbackHref: (artistName: string) => string | null = () => null,
): ShowcaseWork[] {
  const works: ShowcaseWork[] = [];
  for (const { replication, provenance } of items) {
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
      width: replication.width,
      height: replication.height,
      previewUrl: replication.preview_url,
      motionUrl: replication.motion_url,
      motionPosterUrl: replication.motion_poster_url,
      byline: getCreatorByline(replication),
      artistName,
      artistHref,
      artistHrefExternal: artistHref !== null && internalHref === null,
      effectSlug: provenance.effectSlug,
      effectName:
        effectNameBySlug.get(provenance.effectSlug) ??
        provenance.effectSlug.replace(/-/g, " "),
    });
  }
  return works;
}
