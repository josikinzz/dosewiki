import { getFaviconForUrl } from "@/data/config/sourceFavicons";
import { formatMessage, msg, type Translate } from "@/i18n/messages";
import {
  getCreatorByline,
  hasKnownCreator,
} from "@/features/effects/components/replicationCredit";
import type { GalleryGroup } from "@/features/effects/gallery/galleryTypes";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import type { ShowcaseWork } from "../components/showcaseWork";

/**
 * The Artist Page's works model: the artist's whole body of work as one
 * showcase carousel — a single viewer-ready gallery group in the artist's
 * own curated order, exactly as it arrives from the focused gallery group.
 */

/** The single showcase group's stable key — never a real effect slug. */
export const ARTIST_WORKS_KEY = "__artist-works__";

/**
 * Wrap one artist's (already curated-ordered) works into the single
 * viewer-ready gallery group the page's one showcase stages. `translate` is
 * the page's `t`, so the group's label reads in the UI locale.
 */
export function buildArtistShowcaseGroup(
  items: readonly PublicGalleryReplicationPreview[],
  translate: Translate = formatMessage,
): GalleryGroup {
  let videoCount = 0;
  let audioCount = 0;
  for (const item of items) {
    if (item.type === "video") videoCount += 1;
    else if (item.type === "audio") audioCount += 1;
  }
  return {
    key: ARTIST_WORKS_KEY,
    label: translate(msg("All works")),
    count: items.length,
    imageCount: items.length - videoCount - audioCount,
    videoCount,
    audioCount,
    items: [...items],
  };
}

/**
 * Flatten a gallery preview into the serializable stage work the showcase
 * consumes. `artistHref` stays null on purpose: every work here belongs to the
 * page's own artist, and the identity header already carries the name — a
 * per-stage byline would only link the page to itself (the showcase hides the
 * credit row too, but aria labels still read the byline).
 */
export function showcaseWorkFromPreview(
  preview: PublicGalleryReplicationPreview,
  effectName: string,
  avatarUrl: string | null,
): ShowcaseWork {
  return {
    slug: preview.slug,
    title: preview.title,
    type: preview.type === "video" ? "video" : "image",
    url: preview.url,
    thumbnailUrl: preview.thumbnail_url,
    format: preview.format,
    duration: preview.duration,
    hasAudio: preview.has_audio,
    width: preview.width,
    height: preview.height,
    previewUrl: preview.preview_url,
    motionUrl: preview.motion_url,
    motionPosterUrl: preview.motion_poster_url,
    byline: getCreatorByline(preview),
    artistName: hasKnownCreator(preview.artist) ? preview.artist.trim() : null,
    artistHref: null,
    artistHrefExternal: false,
    avatarUrl,
    effectSlug: preview.effect_slug ?? "",
    effectName,
  };
}

/**
 * The identity header's count line: always the works total, plus the media
 * split only where it says something. One kind alone needs no split ("24
 * works", never "24 works · 24 images · 0 videos"), and a kind the artist has
 * none of is omitted rather than printed as a zero. `translate` is the
 * header's `t`, so every count phrase reads in the UI locale.
 */
export function formatArtistWorksLine(
  counts: {
    count: number;
    imageCount: number;
    videoCount: number;
    audioCount?: number;
  },
  translate: Translate = formatMessage,
): string {
  const works =
    counts.count === 1
      ? translate(msg("{{count}} work"), { count: counts.count })
      : translate(msg("{{count}} works"), { count: counts.count });
  const parts = [
    { n: counts.imageCount, one: msg("{{count}} image"), many: msg("{{count}} images") },
    { n: counts.videoCount, one: msg("{{count}} video"), many: msg("{{count}} videos") },
    { n: counts.audioCount ?? 0, one: msg("{{count}} audio clip"), many: msg("{{count}} audio clips") },
  ].filter((part) => part.n > 0);
  if (parts.length < 2) return works;
  return [
    works,
    ...parts.map((part) => translate(part.n === 1 ? part.one : part.many, { count: part.n })),
  ].join(" · ");
}

/**
 * How an artist's external link wears its site mark. Recognizable platforms
 * get their committed brand glyph; domains the further-reading corpus already
 * ships a favicon for reuse it (`getFaviconForUrl`, committed PNGs — never a
 * runtime favicon fetcher); everything else falls back to the globe.
 */
const BRAND_ICON_BY_HOST: Record<string, string> = {
  "wikipedia.org": "simple-icons:wikipedia",
  "youtube.com": "simple-icons:youtube",
  "youtu.be": "simple-icons:youtube",
  "instagram.com": "simple-icons:instagram",
  "facebook.com": "simple-icons:facebook",
  "twitter.com": "simple-icons:x",
  "x.com": "simple-icons:x",
  "reddit.com": "simple-icons:reddit",
  "patreon.com": "simple-icons:patreon",
  "vimeo.com": "simple-icons:vimeo",
  "twitch.tv": "simple-icons:twitch",
  "github.com": "simple-icons:github",
  "tiktok.com": "simple-icons:tiktok",
  "soundcloud.com": "simple-icons:soundcloud",
  "discord.gg": "simple-icons:discord",
  "discord.com": "simple-icons:discord",
  "deviantart.com": "simple-icons:deviantart",
  "artstation.com": "simple-icons:artstation",
  "behance.net": "simple-icons:behance",
  "tumblr.com": "simple-icons:tumblr",
  "linktr.ee": "simple-icons:linktree",
  "ko-fi.com": "simple-icons:kofi",
  "bsky.app": "simple-icons:bluesky",
  "threads.net": "simple-icons:threads",
  "t.me": "simple-icons:telegram",
  "bandcamp.com": "simple-icons:bandcamp",
  "spotify.com": "simple-icons:spotify",
  "substack.com": "simple-icons:substack",
  "medium.com": "simple-icons:medium",
  "dribbble.com": "simple-icons:dribbble",
};

export interface ArtistLinkPresentation {
  /** Iconify name when the host maps to a brand glyph or the globe fallback. */
  icon: string | null;
  /** Committed favicon path; mutually exclusive with `icon`. */
  faviconSrc: string | null;
}

export function artistLinkPresentation(url: string): ArtistLinkPresentation {
  let host: string | null = null;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = null;
  }
  if (host) {
    // Walk sub.domain.tld up toward the registrable domain so a channel or
    // regional subdomain still lands on its platform's glyph.
    const parts = host.split(".");
    for (let index = 0; index < parts.length - 1; index += 1) {
      const icon = BRAND_ICON_BY_HOST[parts.slice(index).join(".")];
      if (icon) {
        return { icon, faviconSrc: null };
      }
    }
  }
  const faviconSrc = getFaviconForUrl(url);
  return { icon: faviconSrc ? null : "lucide:globe", faviconSrc };
}

/**
 * Fold the legacy per-work `artist_url` into the profile links row without
 * duplicating a destination the profile already names. Comparison ignores
 * scheme, `www.`, case, and trailing slashes — the level at which two links
 * are "the same place".
 */
export function mergeArtistLinks(
  profileLinks: readonly { label: string; url: string }[],
  externalUrl: string | undefined,
): { label: string; url: string }[] {
  const links = [...profileLinks];
  if (!externalUrl) {
    return links;
  }
  const normalize = (url: string) => {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
    } catch {
      return url.trim().toLowerCase();
    }
  };
  const target = normalize(externalUrl);
  if (links.some((link) => normalize(link.url) === target)) {
    return links;
  }
  let label = externalUrl;
  try {
    label = new URL(externalUrl).hostname.replace(/^www\./, "");
  } catch {
    // Keep the raw URL as the label; the sanitized corpus should never hit this.
  }
  return [...links, { label, url: externalUrl }];
}

/**
 * Links displayed on an Artist Page.
 *
 * A claimed Contributor Profile is the curated public source of truth. Legacy
 * per-work `artist_url` values remain on the replication rows (and therefore
 * remain available on their item pages as provenance), but must not be
 * promoted into profile chips after the owner has curated their profile links.
 * Unclaimed artists still receive the historical URL as a useful fallback.
 */
export function artistPagePublicLinks(
  profileLinks: readonly { label: string; url: string }[],
  externalUrl: string | undefined,
  hasClaimedProfile: boolean,
): { label: string; url: string }[] {
  return hasClaimedProfile
    ? [...profileLinks]
    : mergeArtistLinks(profileLinks, externalUrl);
}
