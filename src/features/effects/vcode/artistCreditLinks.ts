import { isDisplayable } from "@/features/effects/gallery/galleryArtistIdentity";
import { artistPageHrefForWork } from "@/features/replications/galleryFocus";
import type { PublicGalleryReplicationPreview } from "@/types/replications";

/** Where one article credit line points, and whether that leaves the site. */
export interface ArtistCreditLink {
  href: string;
  external: boolean;
}

/** Credit line (normalized) to destination. */
export type ArtistCreditLinks = ReadonlyMap<string, ArtistCreditLink>;

/**
 * Article embeds carry the credit as free text (`artist="Chelsea Morgan"`),
 * so matching a gallery row is a name comparison. Casing and inner runs of
 * whitespace vary between the two corpora and never distinguish two artists.
 */
function creditKey(artist: string | undefined): string {
  return (artist ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve every credit line in the gallery corpus to the destination an
 * article byline should link. Same policy as a showcase byline: the artist's
 * own Artist Page when a displayable work proves that page exists, else the
 * artist's own site, else nowhere — an unlinked credit beats a 404 for the
 * artists whose only works are withheld from artist views.
 */
export function buildArtistCreditLinks(
  replications: readonly Pick<PublicGalleryReplicationPreview, "artist" | "artist_url" | "effect_slug" | "url">[],
): ArtistCreditLinks {
  const links = new Map<string, ArtistCreditLink>();

  for (const replication of replications) {
    const key = creditKey(replication.artist);
    if (!key) continue;

    const artistPageHref = isDisplayable(replication)
      ? artistPageHrefForWork(replication)
      : null;
    if (artistPageHref) {
      links.set(key, { href: artistPageHref, external: false });
      continue;
    }

    if (links.has(key)) continue;
    const external = replication.artist_url?.trim();
    if (external) {
      links.set(key, { href: external, external: true });
    }
  }

  return links;
}

/** The destination for one article credit line, or `null` to leave it plain. */
export function resolveArtistCreditLink(
  links: ArtistCreditLinks | undefined,
  artist: string | undefined,
): ArtistCreditLink | null {
  if (!links) return null;
  return links.get(creditKey(artist)) ?? null;
}
