import { describe, expect, it } from "vitest";
import { resolveDevRouteState } from "./NextDevRouteClient";

describe("resolveDevRouteState", () => {
  it("uses the parsed dev route when the pathname points at a dev tab alias", () => {
    expect(
      resolveDevRouteState("/dev/changelog/lsd", { tab: "articles", slug: "fallback" }),
    ).toEqual({
      tab: "change-log",
      slug: "lsd",
    });
  });

  it("returns the fallback state for null pathnames", () => {
    expect(
      resolveDevRouteState(null, { tab: "profile", slug: "josie" }),
    ).toEqual({
      tab: "profile",
      slug: "josie",
    });
  });

  it("returns the fallback state for non-dev routes", () => {
    expect(
      resolveDevRouteState("/about", { tab: "index-layout", slug: "fallback-layout" }),
    ).toEqual({
      tab: "index-layout",
      slug: "fallback-layout",
    });
  });

  it("normalizes unknown dev tabs back to the articles route", () => {
    expect(
      resolveDevRouteState("/dev/unknown-tab/ketamine", { tab: "about" }),
    ).toEqual({
      tab: "articles",
      slug: "ketamine",
    });
  });
});
