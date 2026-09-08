import { describe, expect, it } from "vitest";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import {
  artistPagePublicLinks,
  ARTIST_WORKS_KEY,
  artistLinkPresentation,
  buildArtistShowcaseGroup,
  formatArtistWorksLine,
  mergeArtistLinks,
  showcaseWorkFromPreview,
} from "./artistPageModel";

const preview = (
  overrides: Partial<PublicGalleryReplicationPreview> = {},
): PublicGalleryReplicationPreview => ({
  _id: overrides.slug ?? "row",
  slug: "drifting-wood-grain",
  title: "Drifting (wood grain)",
  artist: "Chelsea Morgan",
  type: "image",
  format: "webp",
  url: "https://cdn.test/drifting.webp",
  created_at: "2024-01-01T00:00:00Z",
  ...overrides,
});


describe("buildArtistShowcaseGroup", () => {
  it("wraps the whole body of work into one group, preserving curated order", () => {
    const items = [
      preview({ slug: "b1", effect_slug: "breathing" }),
      preview({ slug: "d1", effect_slug: "drifting" }),
      preview({ slug: "t1", effect_slug: "tracers" }),
      preview({ slug: "no-effect" }),
    ];

    const group = buildArtistShowcaseGroup(items);

    expect(group.key).toBe(ARTIST_WORKS_KEY);
    expect(group.label).toBe("All works");
    expect(group.count).toBe(4);
    expect(group.items.map((item) => item.slug)).toEqual([
      "b1",
      "d1",
      "t1",
      "no-effect",
    ]);
  });

  it("tallies the media split", () => {
    const items = [
      preview({ slug: "v1", effect_slug: "geometry", type: "video" }),
      preview({ slug: "i1", effect_slug: "geometry" }),
      preview({ slug: "v2", effect_slug: "geometry", type: "video" }),
    ];

    const group = buildArtistShowcaseGroup(items);

    expect(group.videoCount).toBe(2);
    expect(group.imageCount).toBe(1);
  });
});

describe("showcaseWorkFromPreview", () => {
  it("flattens a preview into a stage work without a self-referential artist link", () => {
    const work = showcaseWorkFromPreview(
      preview({
        slug: "v1",
        type: "video",
        format: "mp4",
        thumbnail_url: "https://cdn.test/thumb.webp",
        preview_url: "https://cdn.test/preview.mp4",
        duration: 12,
        has_audio: true,
        effect_slug: "drifting",
      }),
      "Drifting",
      "https://cdn.test/avatar.webp",
    );

    expect(work).toMatchObject({
      slug: "v1",
      type: "video",
      format: "mp4",
      thumbnailUrl: "https://cdn.test/thumb.webp",
      previewUrl: "https://cdn.test/preview.mp4",
      duration: 12,
      hasAudio: true,
      byline: "by Chelsea Morgan",
      artistName: "Chelsea Morgan",
      artistHref: null,
      artistHrefExternal: false,
      avatarUrl: "https://cdn.test/avatar.webp",
      effectSlug: "drifting",
      effectName: "Drifting",
    });
  });

  it("keeps the unattributed marker out of the credit", () => {
    const work = showcaseWorkFromPreview(
      preview({ artist: "Unknown" }),
      "Drifting",
      null,
    );

    expect(work.artistName).toBeNull();
    expect(work.byline).toBe("Creator unknown");
  });
});

describe("formatArtistWorksLine", () => {
  it("shows the media split only for a mixed body of work", () => {
    expect(
      formatArtistWorksLine({ count: 318, imageCount: 2, videoCount: 316 }),
    ).toBe("318 works · 2 images · 316 videos");
    expect(
      formatArtistWorksLine({ count: 29, imageCount: 29, videoCount: 0 }),
    ).toBe("29 works");
    expect(
      formatArtistWorksLine({ count: 1, imageCount: 0, videoCount: 1 }),
    ).toBe("1 work");
    expect(
      formatArtistWorksLine({ count: 2, imageCount: 1, videoCount: 1 }),
    ).toBe("2 works · 1 image · 1 video");
  });
});

describe("artistLinkPresentation", () => {
  it("maps recognizable platforms to their brand glyph, subdomains included", () => {
    expect(artistLinkPresentation("https://www.youtube.com/user/Shmedrixxx"))
      .toEqual({ icon: "simple-icons:youtube", faviconSrc: null });
    expect(artistLinkPresentation("https://music.youtube.com/channel/x").icon)
      .toBe("simple-icons:youtube");
    expect(artistLinkPresentation("https://twitter.com/someone").icon).toBe(
      "simple-icons:x",
    );
  });

  it("uses the Wikipedia wordmark for language and mobile subdomains", () => {
    for (const host of ["wikipedia.org", "en.wikipedia.org", "en.m.wikipedia.org"]) {
      expect(artistLinkPresentation(`https://${host}/wiki/Symmetric_Vision`))
        .toEqual({ icon: "simple-icons:wikipedia", faviconSrc: null });
    }
  });

  it("falls back to a committed favicon for known source domains", () => {
    expect(
      artistLinkPresentation("https://psychonautwiki.org/wiki/User:X"),
    ).toEqual({ icon: null, faviconSrc: "/favicons/psychonautwiki.png" });
  });

  it("falls back to the globe for everything else", () => {
    expect(
      artistLinkPresentation("https://symmetric-vision.xyz/"),
    ).toEqual({ icon: "lucide:globe", faviconSrc: null });
    expect(artistLinkPresentation("not a url").icon).toBe("lucide:globe");
  });
});

describe("mergeArtistLinks", () => {
  const links = [
    { label: "Portfolio", url: "https://www.chelseamorganart.co.uk/" },
  ];

  it("keeps the profile links and appends a host-labelled own-site link", () => {
    expect(mergeArtistLinks(links, "https://example.com/gallery")).toEqual([
      ...links,
      { label: "example.com", url: "https://example.com/gallery" },
    ]);
  });

  it("drops an own-site URL the profile already names, ignoring scheme, www, and trailing slash", () => {
    expect(
      mergeArtistLinks(links, "http://chelseamorganart.co.uk"),
    ).toEqual(links);
  });

  it("passes through when there is no own-site URL", () => {
    expect(mergeArtistLinks(links, undefined)).toEqual(links);
  });
});

describe("artistPagePublicLinks", () => {
  it("uses only curated profile links for a claimed artist", () => {
    const personalSite = [
      { label: "personal website", url: "https://josiekins.xyz/" },
    ];

    expect(
      artistPagePublicLinks(
        personalSite,
        "https://psychonautwiki.org/wiki/User:Josikins",
        true,
      ),
    ).toEqual(personalSite);
    expect(
      artistPagePublicLinks(
        personalSite,
        "https://www.reddit.com/user/josikins/",
        true,
      ),
    ).toEqual(personalSite);
  });

  it("does not resurrect a legacy link when a claimed profile intentionally has none", () => {
    expect(
      artistPagePublicLinks(
        [],
        "https://www.reddit.com/user/source-era-handle/",
        true,
      ),
    ).toEqual([]);
  });

  it("keeps the legacy per-work URL as a fallback for an unclaimed artist", () => {
    expect(
      artistPagePublicLinks([], "https://artist.example/portfolio", false),
    ).toEqual([
      { label: "artist.example", url: "https://artist.example/portfolio" },
    ]);
  });
});
