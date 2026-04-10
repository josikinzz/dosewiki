import { describe, expect, it } from "vitest";
import {
  buildArticleVerification,
  buildArticlePathsForRevalidation,
  deriveSubmittedBy,
  parseAboutPayload,
  parseChangelogPayload,
  summarizeArticleForDebug,
  toArticleSnapshot,
} from "./saveToConvexUtils";

describe("saveToConvexUtils", () => {
  it("parses About payloads and filters invalid founder keys", () => {
    expect(
      parseAboutPayload({
        aboutMarkdown: "Mission",
        aboutSubtitle: "Subtitle",
        founderProfileKeys: ["josie", 42, "sam"],
      }),
    ).toEqual({
      aboutMarkdown: "Mission",
      aboutSubtitle: "Subtitle",
      founderProfileKeys: ["josie", "sam"],
    });

    expect(parseAboutPayload({ founderProfileKeys: [123, false] })).toEqual({
      aboutMarkdown: undefined,
      aboutSubtitle: undefined,
      founderProfileKeys: [],
    });

    expect(parseAboutPayload({})).toBeNull();
    expect(parseAboutPayload("nope")).toBeNull();
  });

  it("parses changelog payloads and ignores invalid article entries", () => {
    expect(
      parseChangelogPayload({
        markdown: "# Changes",
        articles: [
          { id: 1, title: "LSD", slug: "lsd" },
          { id: "2", title: "Bad", slug: "bad" },
        ],
      }),
    ).toEqual({
      markdown: "# Changes",
      articles: [{ id: 1, title: "LSD", slug: "lsd" }],
    });

    expect(
      parseChangelogPayload({
        markdown: "# Empty",
        articles: [{ id: "2", title: "Bad", slug: "bad" }],
      }),
    ).toBeNull();

    expect(parseChangelogPayload({ markdown: 12, articles: [] })).toBeNull();
  });

  it("builds article summaries with id and slug fallbacks", () => {
    expect(
      summarizeArticleForDebug(
        {
          id: 7,
          title: "2C-B",
          slug: "2c-b",
        },
        0,
      ),
    ).toEqual({
      target: "id:7",
      id: 7,
      title: "2C-B",
      requestedSlug: "2c-b",
      fallbackSlug: "2c-b",
    });

    expect(
      summarizeArticleForDebug(
        {
          title: "  Alpha-PVP  ",
        },
        1,
      ),
    ).toEqual({
      target: "slug:alpha-pvp",
      id: null,
      title: "Alpha-PVP",
      requestedSlug: null,
      fallbackSlug: "alpha-pvp",
    });
  });

  it("builds a sorted unique revalidation path list", () => {
    const summaries = [
      {
        target: "id:1",
        id: 1,
        title: "LSD",
        requestedSlug: "lsd",
        fallbackSlug: "lsd",
      },
      {
        target: "slug:alpha-pvp",
        id: null,
        title: "Alpha-PVP",
        requestedSlug: null,
        fallbackSlug: "alpha-pvp",
      },
    ];

    const previousByTarget = new Map([
      ["id:1", { id: 1, title: "LSD", slug: "lysergic-acid-diethylamide" }],
      ["slug:alpha-pvp", null],
    ]);

    const verification = [
      {
        target: "id:1",
        found: true,
        previousSlug: "lysergic-acid-diethylamide",
        requestedSlug: "lsd",
        storedSlug: "lsd",
        storedTitle: "LSD",
        titleMatches: true,
        slugMatches: true,
      },
      {
        target: "slug:alpha-pvp",
        found: true,
        previousSlug: null,
        requestedSlug: "alpha-pvp",
        storedSlug: "alpha-pvp",
        storedTitle: "Alpha-PVP",
        titleMatches: true,
        slugMatches: true,
      },
    ];

    expect(buildArticlePathsForRevalidation(summaries, previousByTarget, verification)).toEqual([
      "/alpha-pvp",
      "/lsd",
      "/lysergic-acid-diethylamide",
      "/substances",
    ]);
  });

  it("derives submitted-by keys from email first and name second", () => {
    expect(deriveSubmittedBy("josie.dev@example.com", "Josie Dev")).toBe("JOSIEDEV");
    expect(deriveSubmittedBy("@example.com", "Editor Name")).toBe("EDITORNAME");
  });

  it("normalizes snapshots and verification state", () => {
    const summary = summarizeArticleForDebug({ id: 4, title: "MDMA", slug: "mdma" }, 0);
    const previous = toArticleSnapshot({ id: 4, title: "Ecstasy", slug: "ecstasy" });
    const stored = toArticleSnapshot({ id: 4, title: "MDMA", slug: "mdma" });

    expect(buildArticleVerification(summary, previous, stored)).toEqual({
      target: "id:4",
      found: true,
      previousSlug: "ecstasy",
      requestedSlug: "mdma",
      storedSlug: "mdma",
      storedTitle: "MDMA",
      titleMatches: true,
      slugMatches: true,
    });
  });
});
