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
      sort: "video-first",
    });
  });

  it("reads every recognized parameter", () => {
    expect(
      parseGalleryBrowseState(
        new URLSearchParams("view=effect&q=drifting&type=video&sort=alpha"),
      ),
    ).toEqual({
      view: "effect",
      query: "drifting",
      type: "video",
      sort: "alpha",
    });
  });

  it("treats junk values as defaults instead of an unrepresentable state", () => {
    expect(
      parseGalleryBrowseState(
        new URLSearchParams("view=banana&type=hologram&sort=biggest"),
      ),
    ).toEqual({ view: "artist", query: "", type: "all", sort: "video-first" });
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
        sort: "video-first",
      }),
    ).toBe(REPLICATIONS_PATH);
  });

  it("drops a whitespace-only query", () => {
    expect(buildGalleryBrowseUrl({ query: "   " })).toBe(REPLICATIONS_PATH);
  });

  it("keeps the artist sort across a round trip through effect view", () => {
    const url = buildGalleryBrowseUrl({ view: "effect", sort: "count" });
    expect(paramsOf(url).get("sort")).toBe("count");
  });

  it("round-trips every non-default state through parse", () => {
    const states: GalleryBrowseState[] = [
      { view: "effect", query: "", type: "all", sort: "count" },
      { view: "artist", query: "", type: "all", sort: "count" },
      { view: "artist", query: "drifting", type: "all", sort: "alpha" },
      { view: "artist", query: "", type: "video", sort: "count" },
      {
        view: "effect",
        query: "symmetry & light",
        type: "image",
        sort: "alpha",
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
