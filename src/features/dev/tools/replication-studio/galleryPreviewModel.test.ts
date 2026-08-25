import { describe, expect, it } from "vitest";

import { getCreatorByline } from "@/features/effects/components/replicationCredit";
import { previewWorksFromMatches } from "./galleryPreviewModel";
import type {
  GalleryMatch,
  GalleryMatchReplication,
} from "./substanceGalleryPortalModel";

function match(
  slug: string,
  overrides: Partial<GalleryMatchReplication> = {},
  provenance: Partial<Extract<GalleryMatch["provenance"], { matchedVia: "specific_drug" }>> = {},
): GalleryMatch {
  return {
    replication: {
      id: `id-${slug}`,
      slug,
      title: slug.toUpperCase(),
      artist: "Chelsea Morgan",
      type: "image",
      effect_slug: "drifting",
      effect_name: "Drifting",
      effect_tags: [],
      credit_line: null,
      rights_status: null,
      url: `https://cdn.example/${slug}.png`,
      thumbnail_url: null,
      format: "png",
      ...overrides,
    },
    provenance: {
      matchedVia: "specific_drug",
      effectSlug: "drifting",
      effectName: "Drifting",
      substanceSlug: slug,
      ...provenance,
    },
  };
}

describe("previewWorksFromMatches", () => {
  it("drops what the stage cannot draw and ranks motion above stills", () => {
    const works = previewWorksFromMatches([
      match("a", { type: "image" }),
      match("b", { type: "audio" }),
      match("c", { type: "video" }),
    ]);

    // The audio row drops; the video leads its still exactly as the public
    // builder's audio-first media rank orders the article.
    expect(works.map((work) => work.slug)).toEqual(["c", "a"]);
    expect(works.map((work) => work.type)).toEqual(["video", "image"]);
  });

  it("preserves the caller's effective public order within a media rank", () => {
    const works = previewWorksFromMatches([
      match("c"),
      match("a"),
      match("b"),
    ]);

    expect(works.map((work) => work.slug)).toEqual(["c", "a", "b"]);
  });

  it("takes the byline from the shared credit helper, known creator or not", () => {
    const known = match("known", { artist: "Chelsea Morgan" });
    const unknown = match("unknown", { artist: "unknown" });
    const blank = match("blank", { artist: "   " });

    const works = previewWorksFromMatches([known, unknown, blank]);

    expect(works.map((work) => work.byline)).toEqual([
      getCreatorByline(known.replication),
      getCreatorByline(unknown.replication),
      getCreatorByline(blank.replication),
    ]);
    expect(works[0].byline).toBe("by Chelsea Morgan");
    expect(works[1].byline).toBe("Creator unknown");
    expect(works.map((work) => work.artistName)).toEqual([
      "Chelsea Morgan",
      null,
      null,
    ]);
  });

  it("never links the artist name: the dev preview resolves no contributor profiles", () => {
    const [work] = previewWorksFromMatches([match("a")]);

    expect(work.artistHref).toBeNull();
    expect(work.artistHrefExternal).toBe(false);
  });

  it("humanises the effect slug when provenance carries no display name", () => {
    const works = previewWorksFromMatches([
      match("a", {}, { effectSlug: "visual-haze", effectName: "" }),
      match("b", {}, { effectSlug: "tracers", effectName: "Tracers" }),
    ]);

    expect(works.map((work) => [work.effectSlug, work.effectName])).toEqual([
      ["visual-haze", "visual haze"],
      ["tracers", "Tracers"],
    ]);
  });

  it("carries an unresolved asset through so broken media surfaces in the preview", () => {
    const [work] = previewWorksFromMatches([
      match("a", { url: null, thumbnail_url: null }),
    ]);

    expect(work.url).toBe("");
    expect(work.thumbnailUrl).toBeUndefined();
  });

  it("returns an empty list for no matches", () => {
    expect(previewWorksFromMatches([])).toEqual([]);
  });
});
