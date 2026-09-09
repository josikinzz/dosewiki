import { describe, expect, it } from "vitest";
import {
  buildGalleryBrowseUrl,
  buildGalleryFocusUrl,
  buildReplicationViewerUrl,
  closeReplicationViewerUrl,
  parseGalleryBrowseState,
  parseReplicationViewerSlug,
  REPLICATIONS_PATH,
  type GalleryBrowseState,
} from "./galleryUrlState";

const taxonomyDefaults = {
  viewing: "all" as const,
  artistType: "all" as const,
  effect: "all" as const,
  drug: "all" as const,
  drugClass: "all" as const,
  family: "all" as const,
};

/** Params of a built URL, the way useSearchParams would hand them back. */
function paramsOf(url: string): URLSearchParams {
  const [, query = ""] = url.split("?");
  return new URLSearchParams(query);
}

describe("parseGalleryBrowseState", () => {
  it("reads the bare path as the default state", () => {
    expect(parseGalleryBrowseState(new URLSearchParams())).toEqual({
      view: "artist",
      query: "",
      type: "all",
      sort: "newest",
      year: "all",
      ...taxonomyDefaults,
    });
  });

  it("defaults the order against the view, not globally", () => {
    // "By effect" opens on the editor's curated playlist; the artist and year
    // axes are timelines with no curation to defer to.
    expect(parseGalleryBrowseState(new URLSearchParams("view=effect")).sort).toBe("curated");
    expect(parseGalleryBrowseState(new URLSearchParams("view=year")).sort).toBe("newest");
    expect(parseGalleryBrowseState(new URLSearchParams()).sort).toBe("newest");
  });

  it("reads every recognized parameter", () => {
    expect(
      parseGalleryBrowseState(
        new URLSearchParams("view=effect&q=drifting&type=video&sort=oldest&year=2020&viewing=open-eye&artistType=replicator&effect=tracers&drug=lsd&drugClass=psychedelics&family=experiential-replication"),
      ),
    ).toEqual({
      view: "effect",
      query: "drifting",
      type: "video",
      sort: "oldest",
      year: "2020",
      viewing: "open-eye",
      artistType: "replicator",
      effect: "tracers",
      drug: "lsd",
      drugClass: "psychedelics",
      family: "experiential-replication",
    });
  });

  it("treats junk values as defaults instead of an unrepresentable state", () => {
    // `status=` covers the retired review-status axis: old bookmarked URLs
    // still parse, the unknown param is simply ignored. `sort=video-first` is
    // the retired artist-sort vocabulary, and reads as this view's default.
    expect(
      parseGalleryBrowseState(
        new URLSearchParams("view=banana&type=hologram&sort=video-first&year=19&status=replication"),
      ),
    ).toEqual({ view: "artist", query: "", type: "all", sort: "newest", year: "all", ...taxonomyDefaults });
  });
});

describe("replication viewer URL state", () => {
  it("parses only valid replication slugs", () => {
    expect(
      parseReplicationViewerSlug(new URLSearchParams("viewer=allseeinghand")),
    ).toBe("allseeinghand");
    expect(
      parseReplicationViewerSlug(new URLSearchParams("viewer=4-ho-met-grid")),
    ).toBe("4-ho-met-grid");
    expect(
      parseReplicationViewerSlug(
        new URLSearchParams("viewer=drifting-gun-unknown_artist"),
      ),
    ).toBe("drifting-gun-unknown_artist");
    expect(
      parseReplicationViewerSlug(new URLSearchParams("viewer=../../etc")),
    ).toBeNull();
    expect(
      parseReplicationViewerSlug(new URLSearchParams("viewer=MixedCase")),
    ).toBeNull();
  });

  it("adds and replaces the active work without losing source state", () => {
    const opened = buildReplicationViewerUrl(
      "/replications?view=effect&q=drifting&type=video&sort=count",
      "first-work",
    );
    expect(opened).toBe(
      "/replications?view=effect&q=drifting&type=video&sort=count&viewer=first-work",
    );
    expect(buildReplicationViewerUrl(opened, "second-work")).toBe(
      "/replications?view=effect&q=drifting&type=video&sort=count&viewer=second-work",
    );
  });


  it("closes only the viewer and preserves the collection URL", () => {
    expect(
      closeReplicationViewerUrl(
        "/replications/artist/symmetric-vision?type=video&viewer=lattice#works",
      ),
    ).toBe("/replications/artist/symmetric-vision?type=video#works");
  });

  it("does not emit an invalid active slug", () => {
    expect(buildReplicationViewerUrl("/effects/tracers?q=x", "../escape")).toBe(
      "/effects/tracers?q=x",
    );
  });
});

describe("buildGalleryBrowseUrl", () => {
  it("omits defaults so the canonical browse view is the bare path", () => {
    expect(buildGalleryBrowseUrl({})).toBe(REPLICATIONS_PATH);
    expect(
      buildGalleryBrowseUrl({
        view: "artist",
        query: "",
        type: "all",
        sort: "newest",
        year: "all",
        ...taxonomyDefaults,
      }),
    ).toBe(REPLICATIONS_PATH);
  });

  it("drops a whitespace-only query", () => {
    expect(buildGalleryBrowseUrl({ query: "   " })).toBe(REPLICATIONS_PATH);
  });

  it("omits the order each view already defaults to, and names any other", () => {
    // The default differs per axis, so a clean URL differs per axis too:
    // curation is the effect view's resting state, recency the other two's.
    expect(paramsOf(buildGalleryBrowseUrl({ view: "effect", sort: "curated" })).get("sort")).toBeNull();
    expect(paramsOf(buildGalleryBrowseUrl({ view: "year", sort: "newest" })).get("sort")).toBeNull();
    expect(paramsOf(buildGalleryBrowseUrl({ view: "effect", sort: "oldest" })).get("sort")).toBe("oldest");
    expect(paramsOf(buildGalleryBrowseUrl({ view: "artist", sort: "oldest" })).get("sort")).toBe("oldest");
  });

  it("keeps a named direction across a round trip through another view", () => {
    const url = buildGalleryBrowseUrl({ view: "effect", sort: "oldest" });
    expect(paramsOf(url).get("sort")).toBe("oldest");
  });

  it("refuses curation outside the view that has any", () => {
    // `curated` names an editor's `gallery_order`; an artist and a year have
    // none, so the value is unrepresentable there and reads as the default.
    const params = paramsOf(buildGalleryBrowseUrl({ view: "artist", sort: "curated" }));
    expect(params.get("sort")).toBe("curated");
    expect(parseGalleryBrowseState(params).sort).toBe("newest");
  });

  it("carries a year rail's own key as the year filter", () => {
    expect(paramsOf(buildGalleryBrowseUrl({ view: "year", year: "2020" })).get("year")).toBe("2020");
    expect(paramsOf(buildGalleryBrowseUrl({ view: "year", year: "1939-1952" })).get("year")).toBe("1939-1952");
    expect(paramsOf(buildGalleryBrowseUrl({ view: "year", year: "undated" })).get("year")).toBe("undated");
    expect(parseGalleryBrowseState(paramsOf("/replications?year=nonsense")).year).toBe("all");
  });

  it("round-trips every non-default state through parse", () => {
    const states: GalleryBrowseState[] = [
      { view: "effect", query: "", type: "all", sort: "newest", year: "all", ...taxonomyDefaults },
      { view: "artist", query: "", type: "all", sort: "oldest", year: "all", ...taxonomyDefaults },
      { view: "year", query: "", type: "all", sort: "newest", year: "2020", ...taxonomyDefaults },
      { view: "year", query: "", type: "all", sort: "oldest", year: "undated", ...taxonomyDefaults },
      { view: "artist", query: "drifting", type: "all", sort: "newest", year: "all", ...taxonomyDefaults },
      { view: "artist", query: "", type: "video", sort: "oldest", year: "all", ...taxonomyDefaults },
      {
        view: "effect",
        query: "symmetry & light",
        type: "image",
        sort: "curated",
        year: "1939-1952",
        viewing: "closed-eye",
        artistType: "traditional-psychedelic-artist",
        effect: "internal-hallucination",
        drug: "salvia",
        drugClass: "other",
        family: "visionary-psychedelic-art",
      },
    ];
    for (const state of states) {
      expect(
        parseGalleryBrowseState(paramsOf(buildGalleryBrowseUrl(state))),
      ).toEqual(state);
    }
  });
});

describe("buildGalleryFocusUrl", () => {
  it("addresses artist groups as focused galleries and effects as articles", () => {
    expect(
      buildGalleryFocusUrl({ kind: "artist", key: "chelsea-morgan" }),
    ).toBe("/replications/artist/chelsea-morgan");
    expect(
      buildGalleryFocusUrl({
        kind: "effect",
        key: "symmetrical-texture-repetition",
      }),
    ).toBe("/effects/symmetrical-texture-repetition");
  });

  it("carries only the media-type filter, and only when non-default", () => {
    expect(
      buildGalleryFocusUrl(
        { kind: "artist", key: "chelsea-morgan" },
        { type: "video" },
      ),
    ).toBe("/replications/artist/chelsea-morgan?type=video");
    expect(
      buildGalleryFocusUrl(
        { kind: "artist", key: "chelsea-morgan" },
        { type: "all" },
      ),
    ).toBe("/replications/artist/chelsea-morgan");
  });

  it("does not carry gallery-only filters onto effect articles", () => {
    expect(
      buildGalleryFocusUrl(
        { kind: "effect", key: "symmetrical-texture-repetition" },
        { type: "video" },
      ),
    ).toBe("/effects/symmetrical-texture-repetition");
  });

  it("percent-encodes a hostile key rather than emitting a broken path", () => {
    expect(buildGalleryFocusUrl({ kind: "artist", key: "a/b?c" })).toBe(
      "/replications/artist/a%2Fb%3Fc",
    );
  });
});
