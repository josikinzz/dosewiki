import { describe, expect, it } from "vitest";

import {
  buildReviewHistoryState,
  buildReviewUrl,
  parseReviewLocation,
  readReviewHistoryState,
  resolveInitialView,
  resolveSeedLocation,
  resolveTraversedLocation,
} from "./reviewUrl";

describe("buildReviewUrl", () => {
  it("round-trips Review Flag filters and grouping", () => {
    const url = buildReviewUrl({ slug: "2c-b", view: "editor", flagLabels: ["skinny", "missing citations"], flagSeverity: "major", flagGroupBy: "label" });
    expect(parseReviewLocation(url)).toEqual({ slug: "2c-b", view: "editor", flagLabels: ["skinny", "missing citations"], flagSeverity: "major", flagGroupBy: "label" });
  });
  it("states the webpage view rather than leaving it to be inferred", () => {
    expect(buildReviewUrl({ slug: "2c-b", view: "webpage" })).toBe(
      "/review/2c-b?view=webpage",
    );
  });

  it("carries the editor view in a query parameter, never the hash", () => {
    const url = buildReviewUrl({ slug: "2c-b", view: "editor" });
    expect(url).toBe("/review/2c-b?view=editor");
    expect(url).not.toContain("#");
  });

  it("writes the bare path only when the caller states no view", () => {
    expect(buildReviewUrl({ slug: "2c-b" })).toBe("/review/2c-b");
    expect(buildReviewUrl({ slug: "2c-b", view: null })).toBe("/review/2c-b");
  });

  it("falls back to the index path when there is no slug", () => {
    expect(buildReviewUrl({ slug: null, view: "webpage" })).toBe("/review?view=webpage");
    expect(buildReviewUrl({ slug: "", view: "editor" })).toBe("/review?view=editor");
    expect(buildReviewUrl({ slug: "   " })).toBe("/review");
  });

  it("percent-encodes slugs that are not URL-safe", () => {
    expect(buildReviewUrl({ slug: "α-pvp", view: "webpage" })).toBe(
      "/review/%CE%B1-pvp?view=webpage",
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

  it("round-trips everything build emits, view included", () => {
    for (const view of ["webpage", "editor"] as const) {
      const parsed = parseReviewLocation(buildReviewUrl({ slug: "α-pvp", view }));
      expect(parsed.slug).toBe("α-pvp");
      expect(parsed.view).toBe(view);
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

describe("resolveSeedLocation", () => {
  it("adopts an entry the workbench already stamped, over the resolved fallback", () => {
    const state = buildReviewHistoryState({ slug: "lsd", view: "editor", index: 2 });
    expect(
      resolveSeedLocation(state, "/review/lsd?view=editor", {
        slug: "2c-b",
        view: "webpage",
      }),
    ).toEqual({ slug: "lsd", view: "editor", index: 2, adopted: true });
  });

  it("keeps the adopted entry's depth instead of restarting at zero", () => {
    const state = buildReviewHistoryState({ slug: "lsd", view: "webpage", index: 5 });
    expect(resolveSeedLocation(state, "/review/lsd?view=webpage", {
      slug: "lsd",
      view: "editor",
    })).toEqual({ slug: "lsd", view: "webpage", index: 5, adopted: true });
  });

  it("reads index 0 as a real position, not an absent one", () => {
    const state = buildReviewHistoryState({ slug: "2c-b", view: "webpage", index: 0 });
    const seed = resolveSeedLocation(state, "/review/2c-b?view=webpage", {
      slug: "2c-b",
      view: "editor",
    });
    expect(seed.index).toBe(0);
    expect(seed.adopted).toBe(true);
  });

  it("seeds from the fallback when the entry is not one of ours", () => {
    for (const state of [null, undefined, { __NA: 1, tree: [] }]) {
      expect(
        resolveSeedLocation(state, "/review/2c-b?view=editor", {
          slug: "2c-b",
          view: "webpage",
        }),
      ).toEqual({ slug: "2c-b", view: "webpage", index: 0, adopted: false });
    }
  });

  it("falls back to the URL for an adopted entry that recorded no view", () => {
    expect(
      resolveSeedLocation({ review: { slug: "lsd", index: 3 } }, "/review/lsd?view=editor", {
        slug: "lsd",
        view: "webpage",
      }),
    ).toEqual({ slug: "lsd", view: "editor", index: 3, adopted: true });
  });

  it("falls back to the caller's view when neither entry nor URL states one", () => {
    expect(
      resolveSeedLocation({ review: { slug: "lsd" } }, "/review/lsd", {
        slug: "lsd",
        view: "editor",
      }),
    ).toEqual({ slug: "lsd", view: "editor", index: 0, adopted: true });
  });
});
