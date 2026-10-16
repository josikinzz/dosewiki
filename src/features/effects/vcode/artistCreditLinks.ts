import { isDisplayable } from "@/features/effects/gallery/galleryArtistIdentity";
import { artistPageHrefForWork } from "@/features/replications/galleryFocus";
import type { PublicGalleryReplicationPreview } from "@/types/replications";

export interface ArtistCreditLink {
  href: string;
  external: boolean;
}

export type ArtistCreditLinks = ReadonlyMap<string, ArtistCreditLink>;

function creditKey(artist: string | undefined): string {
  return (artist ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

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

export function resolveArtistCreditLink(
  links: ArtistCreditLinks | undefined,
  artist: string | undefined,
): ArtistCreditLink | null {
  if (!links) return null;
  return links.get(creditKey(artist)) ?? null;
}
