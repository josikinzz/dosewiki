import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEV_TAB,
  DEV_TAB_REGISTRY,
  HOME_DEV_TAB,
  findDevTab,
  firstUsableTab,
  resolveDevRoute,
  resolveDevTabAlias,
} from "./devTabRegistry";
import { saveDestinationFor } from "./DevToolSaveLine";

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
      "inbox",
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
    // Home sits at the lowest floor so every member role opens it.
    expect(byRole("contributor")).toEqual(["home", "contributors", "playlists", "my-reports"]);
  });

  it("declares the save model each tool actually uses", () => {
    for (const tab of DEV_TAB_REGISTRY) {
      expect(["record", "batch", "instant"]).toContain(tab.saveModel);
      expect(["shell", "full-bleed"]).toContain(tab.layout);
    }
    const byModel = (model: string) =>
      DEV_TAB_REGISTRY.filter((tab) => tab.saveModel === model).map((tab) => tab.id);
    // Substances keeps a per-article draft with Save draft, Publish and Submit
    // for review; it has no shared commit panel.
    expect(byModel("record")).toEqual(["articles", "writing", "copy-studio"]);
    expect(byModel("batch")).toEqual(["tag-editor", "index-layout"]);
  });

  it("says an editor's Writing save is submitted for review, not view only", () => {
    const writing = findDevTab("writing");
    expect(saveDestinationFor(writing, false)).toBe("proposal");
    expect(saveDestinationFor(writing, true)).toBe("live");
  });

  it("relabels Change Review for members who can only see their own submissions", () => {
    const queue = findDevTab("queue");
    expect(queue.labelFor?.("admin")).toBe("Change Review");
    expect(queue.labelFor?.("editor")).toBe("My submissions");
    expect(queue.labelFor?.(null)).toBe("My submissions");
  });

  it("keeps tab ids out of the shell's layout, save line and label decisions", () => {
    // The render switch in DevModePageView maps ids to tools by design; these
    // modules decide layout, save lines, labels and landing, and read those
    // from descriptor fields instead.
    const shellModules = [
      "DevModePageChrome.tsx",
      "DevModeToolRail.tsx",
      "DevModeToolSheet.tsx",
      "DevToolSaveLine.tsx",
      "useDevChromeEnvironment.ts",
      "useDevRouteAccess.ts",
    ];
    // `change-log` doubles as the primary-section name, so only tool ids count.
    const toolIds = DEV_TAB_REGISTRY.filter((tab) => tab.group !== "chrome").map((tab) => tab.id);
    for (const file of shellModules) {
      const source = readFileSync(path.join(__dirname, file), "utf8");
      for (const id of toolIds) {
        expect(source.includes(`"${id}"`), `${file} names the "${id}" tab`).toBe(false);
      }
    }
  });

  it("lands every role on the first tool it can use", () => {
    // The Inbox is an admin's entry point (fork F6); the tools stay one click away.
    expect(firstUsableTab("admin")).toBe("inbox");
    expect(firstUsableTab("editor")).toBe("articles");
    expect(firstUsableTab("editor_translator")).toBe("articles");
    // A translator also holds the contributor floor; its own tool comes first.
    expect(firstUsableTab("translator")).toBe("glossary");
    expect(firstUsableTab("contributor")).toBe("contributors");
    expect(firstUsableTab("viewer")).toBe(DEFAULT_DEV_TAB);
    expect(firstUsableTab(null)).toBe(DEFAULT_DEV_TAB);
  });

  it("opens bare /dev on the Home every role can use, ahead of the Inbox in the Start group", () => {
    expect(resolveDevRoute(undefined, undefined)).toEqual({ tab: HOME_DEV_TAB });
    expect(resolveDevRoute("home", undefined)).toEqual({ tab: HOME_DEV_TAB });
    const start = DEV_TAB_REGISTRY.filter((tab) => tab.group === "entry").map((tab) => tab.id);
    expect(start).toEqual([HOME_DEV_TAB, "inbox"]);
    expect(findDevTab(HOME_DEV_TAB).role).toBe("contributor");
    // Home is where bare /dev lands, never a fallback: a fallback names a tool.
    for (const role of ["admin", "editor", "editor_translator", "translator", "contributor"] as const) {
      expect(firstUsableTab(role)).not.toBe(HOME_DEV_TAB);
    }
  });

  it("falls back to the default tab and keeps the slug for unknown segments", () => {
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
