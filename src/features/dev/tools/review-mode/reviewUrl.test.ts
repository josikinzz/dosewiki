import { describe, expect, it } from "vitest";

import {
  buildReviewHistoryState,
  buildReviewUrl,
  isSameReviewLocation,
  parseReviewLocation,
  readReviewHistoryState,
  resolveInitialView,
  resolveTraversedLocation,
} from "./reviewUrl";

describe("buildReviewUrl", () => {
  it("writes the bare path for the default webpage view", () => {
    expect(buildReviewUrl({ slug: "2c-b", view: "webpage" })).toBe("/review/2c-b");
    expect(buildReviewUrl({ slug: "2c-b" })).toBe("/review/2c-b");
    expect(buildReviewUrl({ slug: "2c-b", view: null })).toBe("/review/2c-b");
  });

  it("carries the editor view in a query parameter, never the hash", () => {
    const url = buildReviewUrl({ slug: "2c-b", view: "editor" });
    expect(url).toBe("/review/2c-b?view=editor");
    expect(url).not.toContain("#");
  });

  it("falls back to the index path when there is no slug", () => {
    expect(buildReviewUrl({ slug: null, view: "webpage" })).toBe("/review");
    expect(buildReviewUrl({ slug: "", view: "editor" })).toBe("/review?view=editor");
    expect(buildReviewUrl({ slug: "   ", view: "webpage" })).toBe("/review");
  });

  it("percent-encodes slugs that are not URL-safe", () => {
    expect(buildReviewUrl({ slug: "α-pvp", view: "webpage" })).toBe(
      "/review/%CE%B1-pvp",
    );
  });
});

describe("parseReviewLocation", () => {
  it("reads the slug from a path", () => {
    expect(parseReviewLocation("/review/2c-b")).toEqual({
      slug: "2c-b",
      view: null,
    });
  });

  it("reads the slug and view from an absolute URL", () => {
    expect(parseReviewLocation("https://example.test/review/lsd?view=editor")).toEqual(
      { slug: "lsd", view: "editor" },
    );
  });

  it("treats the index route as a slugless position", () => {
    expect(parseReviewLocation("/review")).toEqual({ slug: null, view: null });
    expect(parseReviewLocation("/review/")).toEqual({ slug: null, view: null });
    expect(parseReviewLocation("/review?view=editor")).toEqual({
      slug: null,
      view: "editor",
    });
  });

  it("ignores path segments past the first, exactly like the route", () => {
    expect(parseReviewLocation("/review/2c-b/extra")).toEqual({
      slug: "2c-b",
      view: null,
    });
  });

  it("decodes percent-encoded slugs", () => {
    expect(parseReviewLocation("/review/%CE%B1-pvp").slug).toBe("α-pvp");
  });

  it("survives a malformed percent escape rather than throwing", () => {
    expect(parseReviewLocation("/review/100%man").slug).toBe("100%man");
  });

  it("rejects an unrecognised view value instead of trusting it", () => {
    expect(parseReviewLocation("/review/2c-b?view=molecules").view).toBeNull();
    expect(parseReviewLocation("/review/2c-b?view=").view).toBeNull();
    expect(parseReviewLocation("/review/2c-b?view=EDITOR").view).toBeNull();
  });

  it("returns nothing for addresses outside the workbench", () => {
    expect(parseReviewLocation("/dev/articles/2c-b")).toEqual({
      slug: null,
      view: null,
    });
    expect(parseReviewLocation("/reviews/2c-b")).toEqual({ slug: null, view: null });
    expect(parseReviewLocation("/")).toEqual({ slug: null, view: null });
  });

  it("ignores a hash, which belongs to the article's table of contents", () => {
    expect(parseReviewLocation("/review/2c-b#dosage")).toEqual({
      slug: "2c-b",
      view: null,
    });
    expect(parseReviewLocation("/review/2c-b?view=editor#dosage")).toEqual({
      slug: "2c-b",
      view: "editor",
    });
  });

  it("round-trips everything build emits", () => {
    for (const view of ["webpage", "editor"] as const) {
      const parsed = parseReviewLocation(buildReviewUrl({ slug: "α-pvp", view }));
      expect(parsed.slug).toBe("α-pvp");
      expect(parsed.view ?? "webpage").toBe(view);
    }
  });
});

describe("readReviewHistoryState", () => {
  it("reads a payload the workbench wrote", () => {
    const state = buildReviewHistoryState({ slug: "2c-b", view: "editor", index: 3 });
    expect(state).toEqual({ review: { slug: "2c-b", view: "editor", index: 3 } });
    expect(readReviewHistoryState(state)).toEqual({
      slug: "2c-b",
      view: "editor",
      index: 3,
    });
  });

  it("tolerates the router internals Next copies onto the payload", () => {
    const state = buildReviewHistoryState({
      slug: "2c-b",
      view: "webpage",
      index: 0,
    }) as unknown as Record<string, unknown>;
    state.__NA = true;
    state.__PRIVATE_NEXTJS_INTERNALS_TREE = ["", {}];
    expect(readReviewHistoryState(state)).toEqual({
      slug: "2c-b",
      view: "webpage",
      index: 0,
    });
  });

  it("refuses payloads it did not write", () => {
    expect(readReviewHistoryState(null)).toBeNull();
    expect(readReviewHistoryState(undefined)).toBeNull();
    expect(readReviewHistoryState("2c-b")).toBeNull();
    expect(readReviewHistoryState({})).toBeNull();
    expect(readReviewHistoryState({ review: {} })).toBeNull();
    expect(readReviewHistoryState({ review: { slug: "" } })).toBeNull();
    expect(readReviewHistoryState({ review: { slug: 7 } })).toBeNull();
    // A Next-owned entry the workbench never touched.
    expect(readReviewHistoryState({ __NA: 1, tree: [] })).toBeNull();
  });

  it("drops an unrecognised view or index but keeps the slug", () => {
    expect(
      readReviewHistoryState({ review: { slug: "lsd", view: "yaml", index: "3" } }),
    ).toEqual({ slug: "lsd", view: null, index: null });
    expect(
      readReviewHistoryState({ review: { slug: "lsd", view: "editor", index: NaN } }),
    ).toEqual({ slug: "lsd", view: "editor", index: null });
  });
});

describe("resolveTraversedLocation", () => {
  it("prefers the state payload over the URL", () => {
    const state = buildReviewHistoryState({ slug: "lsd", view: "editor", index: 2 });
    expect(resolveTraversedLocation(state, "/review/2c-b")).toEqual({
      slug: "lsd",
      view: "editor",
      index: 2,
    });
  });

  it("falls back to the URL for entries with no payload", () => {
    expect(resolveTraversedLocation(null, "/review/2c-b?view=editor")).toEqual({
      slug: "2c-b",
      view: "editor",
      index: null,
    });
  });

  it("defaults a traverse to the webpage view when nothing says otherwise", () => {
    expect(resolveTraversedLocation(null, "/review/2c-b")).toEqual({
      slug: "2c-b",
      view: "webpage",
      index: null,
    });
  });

  it("reports no slug when the traverse left the workbench", () => {
    expect(resolveTraversedLocation(null, "/dev")).toEqual({
      slug: null,
      view: "webpage",
      index: null,
    });
  });

  it("keeps index 0 rather than reading it as absent", () => {
    const state = buildReviewHistoryState({ slug: "2c-b", view: "webpage", index: 0 });
    expect(resolveTraversedLocation(state, "/review/2c-b").index).toBe(0);
  });
});

describe("resolveInitialView", () => {
  it("lets an explicit address win over the stored preference", () => {
    expect(resolveInitialView("editor", "webpage")).toBe("editor");
    expect(resolveInitialView("webpage", "editor")).toBe("webpage");
  });

  it("defers to the stored preference when the address is silent", () => {
    expect(resolveInitialView(null, "editor")).toBe("editor");
    expect(resolveInitialView(null, "webpage")).toBe("webpage");
  });
});

describe("isSameReviewLocation", () => {
  it("treats an omitted view as the webpage default", () => {
    expect(
      isSameReviewLocation({ slug: "2c-b", view: null }, { slug: "2c-b", view: "webpage" }),
    ).toBe(true);
  });

  it("separates positions that differ in slug or view", () => {
    expect(
      isSameReviewLocation({ slug: "2c-b", view: "webpage" }, { slug: "lsd", view: "webpage" }),
    ).toBe(false);
    expect(
      isSameReviewLocation({ slug: "2c-b", view: "webpage" }, { slug: "2c-b", view: "editor" }),
    ).toBe(false);
  });
});
