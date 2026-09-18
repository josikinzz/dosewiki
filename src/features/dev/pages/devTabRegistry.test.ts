import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEV_TAB,
  DEV_TAB_REGISTRY,
  findDevTab,
  resolveDevRoute,
  resolveDevTabAlias,
} from "./devTabRegistry";

describe("devTabRegistry", () => {
  it("keeps ids and route segments unique across descriptors", () => {
    const ids = DEV_TAB_REGISTRY.map((tab) => tab.id);
    expect(new Set(ids).size).toBe(ids.length);

    const segments = DEV_TAB_REGISTRY.flatMap((tab) => [
      tab.id,
      ...tab.aliases,
      ...Object.keys(tab.filter?.segments ?? {}),
    ]);
    expect(new Set(segments).size).toBe(segments.length);
    // `about` is a pinned route onto Writing, not a plain alias; a descriptor
    // claiming it would shadow the pin.
    expect(segments).not.toContain("about");
  });

  it("resolves every id and alias back to its own descriptor", () => {
    for (const tab of DEV_TAB_REGISTRY) {
      expect(findDevTab(tab.id)).toBe(tab);
      for (const segment of [tab.id, ...tab.aliases]) {
        expect(resolveDevTabAlias(segment)).toBe(tab);
        expect(resolveDevRoute(segment, undefined)).toEqual({ tab: tab.id });
        expect(resolveDevRoute(segment, "lsd")).toEqual({ tab: tab.id, slug: "lsd" });
      }
    }
  });

  it("makes review the only external destination", () => {
    const external = DEV_TAB_REGISTRY.filter((tab) => tab.destination.kind === "external");
    expect(external.map((tab) => tab.id)).toEqual(["review"]);
    expect(external[0].destination).toEqual({ kind: "external", href: "/review" });
  });

  it("keeps change log as the only chrome entry", () => {
    const chrome = DEV_TAB_REGISTRY.filter((tab) => tab.group === "chrome").map((tab) => tab.id);
    expect(chrome).toEqual(["change-log"]);
  });

  it("assigns every descriptor a role floor", () => {
    const byRole = (role: string) => DEV_TAB_REGISTRY.filter((tab) => tab.role === role).map((tab) => tab.id);
    for (const tab of DEV_TAB_REGISTRY) {
      expect(["admin", "editor", "translator", "contributor"]).toContain(tab.role);
    }
    expect(byRole("admin")).toEqual([
      "citation-review",
      "trip-report-submissions",
      "article-feedback",
      "molecule-editor",
      "banners",
      "replications",
      "members",
    ]);
    expect(byRole("editor")).toEqual([
      "articles",
      "review",
      "tag-editor",
      "writing",
      "copy-studio",
      "queue",
      "index-layout",
      "change-log",
    ]);
    expect(byRole("translator")).toEqual(["glossary"]);
    expect(byRole("contributor")).toEqual(["contributors", "playlists", "my-reports"]);
  });

  it("falls back to the default tab and keeps the slug for unknown segments", () => {
    expect(resolveDevRoute(undefined, undefined)).toEqual({ tab: DEFAULT_DEV_TAB });
    expect(resolveDevRoute("unknown-tab", "ketamine")).toEqual({ tab: DEFAULT_DEV_TAB, slug: "ketamine" });
    // Prototype names are not tabs.
    expect(resolveDevRoute("constructor", undefined)).toEqual({ tab: DEFAULT_DEV_TAB });
    expect(findDevTab("toString")).toBeUndefined();
    expect(resolveDevTabAlias("hasOwnProperty")).toBeUndefined();
  });

  it("pins /dev/about onto the Writing tab's About entry", () => {
    expect(resolveDevRoute("about", undefined)).toEqual({ tab: "writing", slug: "about" });
    expect(resolveDevRoute("about", "ignored")).toEqual({ tab: "writing", slug: "about" });
  });

  it("declares filter values that the filter segments preset", () => {
    for (const tab of DEV_TAB_REGISTRY) {
      if (!tab.filter) continue;
      for (const [segment, value] of Object.entries(tab.filter.segments ?? {})) {
        expect(tab.filter.values).toContain(value);
        expect(resolveDevTabAlias(segment)).toBe(tab);
        expect(resolveDevRoute(segment, undefined)).toEqual({ tab: tab.id, filter: value });
        expect(resolveDevRoute(segment, "lsd")).toEqual({ tab: tab.id, slug: "lsd", filter: value });
      }
    }
  });

  it("opens /dev/blog on the Writing tab's blog kind", () => {
    expect(findDevTab("blog")).toBeUndefined();
    expect(resolveDevRoute("blog", undefined)).toEqual({ tab: "writing", filter: "blog" });
    expect(resolveDevRoute("blog", "first-post")).toEqual({ tab: "writing", slug: "first-post", filter: "blog" });
  });

  it("opens /dev/profile and /dev/profiles on the Contributors tab's self scope", () => {
    expect(findDevTab("profile")).toBeUndefined();
    expect(resolveDevRoute("profile", undefined)).toEqual({ tab: "contributors", filter: "me" });
    expect(resolveDevRoute("profiles", "JOSIE")).toEqual({
      tab: "contributors",
      slug: "JOSIE",
      filter: "me",
    });
    expect(resolveDevRoute("contributors", undefined, { scope: "me" })).toEqual({
      tab: "contributors",
      filter: "me",
    });
  });

  it("opens /dev/site-feedback and ?source=site on the Feedback tab's site source", () => {
    expect(findDevTab("site-feedback")).toBeUndefined();
    expect(resolveDevRoute("site-feedback", undefined)).toEqual({ tab: "article-feedback", filter: "site" });
    expect(resolveDevRoute("feedback", undefined, { source: "site" })).toEqual({
      tab: "article-feedback",
      filter: "site",
    });
    expect(findDevTab("article-feedback").badge).toBe("feedback");
  });

  it("reads the Writing kind from the query, ignoring values it does not declare", () => {
    expect(resolveDevRoute("writing", undefined, { kind: "blog" })).toEqual({ tab: "writing", filter: "blog" });
    expect(resolveDevRoute("writing", "about", { kind: "article" })).toEqual({
      tab: "writing",
      slug: "about",
      filter: "article",
    });
    expect(resolveDevRoute("writing", undefined, { kind: "poem" })).toEqual({ tab: "writing" });
    expect(resolveDevRoute("writing", undefined, { kind: ["blog"] })).toEqual({ tab: "writing" });
    // The segment's preset wins over the query, and only tabs with a filter read one.
    expect(resolveDevRoute("blog", undefined, { kind: "article" })).toEqual({ tab: "writing", filter: "blog" });
    expect(resolveDevRoute("articles", undefined, { kind: "blog" })).toEqual({ tab: "articles" });
  });
});
