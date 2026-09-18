import { describe, expect, it } from "vitest";
import { groupArticlesForIndex, type ArticleIndexEntry } from "./articlesIndex";

function entry(overrides: Partial<ArticleIndexEntry>): ArticleIndexEntry {
  return {
    slug: "slug",
    title: "Title",
    tags: [],
    ...overrides,
  };
}

const longBody = `[p]${"word ".repeat(1200)}[/p]`;

describe("groupArticlesForIndex", () => {
  it("routes articles to the group their tags claim", () => {
    const groups = groupArticlesForIndex([
      entry({ slug: "psychedelic-intensity-scale", title: "PIS", tags: ["intensity scale"], body_raw: longBody }),
      entry({ slug: "dreams", title: "Dreams", tags: ["dreams", "psychonautics"], body_raw: longBody }),
      entry({ slug: "funding", title: "Funding Proposal", tags: [], body_raw: longBody }),
    ]);

    expect(groups.map((group) => group.id)).toEqual([
      "scales",
      "consciousness",
      "reference",
    ]);
    expect(groups[2].articles.map((article) => article.slug)).toEqual(["funding"]);
  });

  it("files the curated drug guides by slug ahead of the scale their tags would claim", () => {
    const groups = groupArticlesForIndex([
      entry({ slug: "psychedelic-intensity-scale", tags: ["intensity scale"], body_raw: longBody }),
      entry({ slug: "dmt", title: "DMT", tags: ["intensity scale"], body_raw: longBody }),
      entry({ slug: "dxm", title: "DXM", tags: ["intensity scale"], body_raw: longBody }),
    ]);

    expect(groups.map((group) => group.id)).toEqual(["drug-guides", "scales"]);
    expect(groups[0].label).toBe("Drug guides");
    expect(groups[0].articles.map((article) => article.slug)).toEqual(["dmt", "dxm"]);
    expect(groups[1].articles.map((article) => article.slug)).toEqual([
      "psychedelic-intensity-scale",
    ]);
  });

  it("omits groups with no articles", () => {
    const groups = groupArticlesForIndex([
      entry({ tags: ["rating scale"], body_raw: longBody }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("scales");
  });

  it("falls back to the body's first sentence when no short description was written", () => {
    const [group] = groupArticlesForIndex([
      entry({
        tags: [],
        body_raw:
          "[h2]Onset[/h2][p]Onset is the point at which the first effects appear. Come up follows.[/p]",
      }),
    ]);

    expect(group.articles[0].description).toBe(
      "Onset is the point at which the first effects appear.",
    );
  });

  it("prefers the written short description over the body", () => {
    const [group] = groupArticlesForIndex([
      entry({ tags: [], shortDescription: "  Written blurb.  ", body_raw: "[p]Body text.[/p]" }),
    ]);

    expect(group.articles[0].description).toBe("Written blurb.");
  });

  it("caps a long opening sentence on a word boundary with an ellipsis", () => {
    const sentence = `${"lorem ipsum ".repeat(20).trim()}.`;
    const [group] = groupArticlesForIndex([entry({ tags: [], body_raw: `[p]${sentence}[/p]` })]);
    const description = group.articles[0].description ?? "";

    // Ends on a whole word, never mid-word, and stays within the glance limit.
    expect(description).toMatch(/ (lorem|ipsum)…$/);
    expect(description.length).toBeLessThanOrEqual(141);
  });

  it("leaves the description off entries with neither blurb nor body", () => {
    const [group] = groupArticlesForIndex([entry({ tags: [], body_raw: "[h2][/h2]" })]);

    expect(group.articles[0].description).toBeUndefined();
  });

  it("skips a markdown heading when deriving a description for new writing", () => {
    const [group] = groupArticlesForIndex([
      entry({ tags: [], bodyFormat: "markdown", body_raw: "# Hello\n\nWritten today. More." }),
    ]);

    expect(group.articles[0].description).toBe("Written today.");
  });

  it("reports reading length from body prose rather than markup", () => {
    const [group] = groupArticlesForIndex([
      entry({ tags: ["intensity scale"], body_raw: `[p]${"word ".repeat(440)}[/p]` }),
    ]);

    expect(group.articles[0].readMinutes).toBe(2);
  });

  it("leaves length and date off entries that carry neither", () => {
    const [group] = groupArticlesForIndex([entry({ tags: [] })]);

    expect(group.articles[0].readMinutes).toBeUndefined();
    expect(group.articles[0].publishedMonth).toBeUndefined();
  });

  it("formats publication dates down to month and year", () => {
    const [group] = groupArticlesForIndex([
      entry({ tags: [], publicationDate: "2021-05-08T00:00:00.000Z" }),
    ]);

    expect(group.articles[0].publishedMonth).toBe("2021-05");
  });
});

describe("the Recent group", () => {
  it("collects markdown-bodied writing above the archive's subject groups", () => {
    const groups = groupArticlesForIndex([
      {
        slug: "brand-new",
        title: "Brand new",
        tags: ["dreams"],
        bodyFormat: "markdown",
        body_raw: "# Hello\n\nWritten today.",
      },
      {
        slug: "lucid-dreaming",
        title: "Lucid dreaming",
        tags: ["dreams"],
        body_raw: "[h2]Onset[/h2] Archive material.",
      },
    ]);

    expect(groups.map((group) => group.id)).toEqual(["recent", "consciousness"]);
    expect(groups[0].articles.map((article) => article.slug)).toEqual(["brand-new"]);
    expect(groups[1].articles.map((article) => article.slug)).toEqual(["lucid-dreaming"]);
  });

  it("is hidden entirely when nothing new has been written", () => {
    const groups = groupArticlesForIndex([
      { slug: "lucid-dreaming", title: "Lucid dreaming", tags: ["dreams"] },
    ]);

    expect(groups.map((group) => group.id)).not.toContain("recent");
  });
});
