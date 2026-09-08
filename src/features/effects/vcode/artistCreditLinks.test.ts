import { describe, expect, it } from "vitest";

import {
  buildArtistCreditLinks,
  resolveArtistCreditLink,
} from "./artistCreditLinks";
import type { PublicGalleryReplicationPreview } from "@/types/replications";

function work(
  overrides: Partial<PublicGalleryReplicationPreview> = {},
): PublicGalleryReplicationPreview {
  return {
    _id: "id" as PublicGalleryReplicationPreview["_id"],
    slug: "work",
    title: "Work",
    artist: "Chelsea Morgan",
    type: "image",
    format: "jpg",
    effect_slug: "after-images",
    url: "https://media.test/work.jpg",
    created_at: "2011-01-01",
    ...overrides,
  } as PublicGalleryReplicationPreview;
}

describe("article image credits", () => {
  it("links a credited artist to their Artist Page, matching the article's spelling", () => {
    const links = buildArtistCreditLinks([work()]);

    // Article embeds carry the credit as free text, so casing and inner
    // whitespace must not decide whether the byline links.
    expect(resolveArtistCreditLink(links, "  chelsea   MORGAN ")).toEqual({
      href: "/replications/artist/chelsea-morgan",
      external: false,
    });
  });

  it("falls back to the artist's own site when no Artist Page exists", () => {
    // Every work withheld from artist views: the Artist Page would 404.
    const links = buildArtistCreditLinks([
      work({
        artist: "H. R. Giger",
        effect_slug: "unspeakable-horrors",
        artist_url: "https://en.wikipedia.org/wiki/H._R._Giger",
      }),
    ]);

    expect(resolveArtistCreditLink(links, "H. R. Giger")).toEqual({
      href: "https://en.wikipedia.org/wiki/H._R._Giger",
      external: true,
    });
  });

  it("prefers the Artist Page over the artist's own site", () => {
    const links = buildArtistCreditLinks([
      work({
        slug: "withheld",
        effect_slug: "unspeakable-horrors",
        artist_url: "https://chelseamorganart.co.uk",
      }),
      work({ slug: "shown" }),
    ]);

    expect(resolveArtistCreditLink(links, "Chelsea Morgan")).toEqual({
      href: "/replications/artist/chelsea-morgan",
      external: false,
    });
  });

  it("leaves an unattributed or undrawable credit unlinked", () => {
    const links = buildArtistCreditLinks([
      work({ slug: "anon", artist: "Unknown" }),
      // No resolved media URL: the gallery cannot draw it, so it proves no page.
      work({ slug: "broken", artist: "Alice", url: undefined }),
    ]);

    expect(resolveArtistCreditLink(links, "Unknown")).toBeNull();
    expect(resolveArtistCreditLink(links, "Alice")).toBeNull();
    expect(resolveArtistCreditLink(links, "StingrayZ")).toBeNull();
  });
});
