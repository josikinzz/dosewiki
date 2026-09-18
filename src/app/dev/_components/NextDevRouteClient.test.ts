import { describe, expect, it } from "vitest";
import { resolveDevRouteState } from "./NextDevRouteClient";

describe("resolveDevRouteState", () => {
  it("uses the parsed dev route when the pathname points at a dev tab alias", () => {
    expect(
      resolveDevRouteState("/dev/changelog/lsd", null, { tab: "articles", slug: "fallback" }),
    ).toEqual({
      tab: "change-log",
      slug: "lsd",
    });
  });

  it("returns the fallback state for null pathnames", () => {
    expect(
      resolveDevRouteState(null, "kind=blog", { tab: "contributors", slug: "josie" }),
    ).toEqual({
      tab: "contributors",
      slug: "josie",
    });
  });

  it("returns the fallback state for non-dev routes", () => {
    expect(
      resolveDevRouteState("/about", null, { tab: "index-layout", slug: "fallback-layout" }),
    ).toEqual({
      tab: "index-layout",
      slug: "fallback-layout",
    });
  });

  it("normalizes unknown dev tabs back to the articles route", () => {
    expect(
      resolveDevRouteState("/dev/unknown-tab/ketamine", null, { tab: "writing" }),
    ).toEqual({
      tab: "articles",
      slug: "ketamine",
    });
  });

  it("reads a tab filter from the search string and from a filter segment", () => {
    expect(resolveDevRouteState("/dev/writing", "kind=blog", { tab: "articles" })).toEqual({
      tab: "writing",
      slug: undefined,
      filter: "blog",
    });
    expect(resolveDevRouteState("/dev/blog/first-post", "", { tab: "articles" })).toEqual({
      tab: "writing",
      slug: "first-post",
      filter: "blog",
    });
    // The URL is the filter's home: a fallback filter never outlives the search string.
    expect(resolveDevRouteState("/dev/writing", "", { tab: "writing", filter: "blog" })).toEqual({
      tab: "writing",
      slug: undefined,
      filter: undefined,
    });
  });
});
