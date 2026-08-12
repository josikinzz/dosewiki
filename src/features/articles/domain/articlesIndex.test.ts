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
      entry({ slug: "dmt", title: "DMT", tags: ["intensity scale"], body_raw: longBody }),
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

  it("omits groups with no articles", () => {
    const groups = groupArticlesForIndex([
      entry({ tags: ["rating scale"], body_raw: longBody }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("scales");
  });

  it("drops tags the group heading already states", () => {
    const [group] = groupArticlesForIndex([
      entry({
        tags: ["dreams", "psychonautics", "subjective effect documentation"],
        body_raw: longBody,
      }),
    ]);

    expect(group.articles[0].tags).toEqual(["subjective effect documentation"]);
  });

  it("marks short definitional pages as compact rows", () => {
    const [group] = groupArticlesForIndex([
      entry({
        slug: "duration-terminology",
        tags: [],
        body_raw: `[h2]Onset[/h2][p]${"word ".repeat(220)}[/p]`,
      }),
      entry({ slug: "funding", tags: [], body_raw: longBody }),
    ]);

    expect(group.articles.map((article) => article.density)).toEqual([
      "compact",
      "full",
    ]);
  });

  it("reports reading length from body prose rather than markup", () => {
    const [group] = groupArticlesForIndex([
      entry({ tags: ["intensity scale"], body_raw: `[p]${"word ".repeat(440)}[/p]` }),
    ]);

    expect(group.articles[0].lengthLabel).toBe("2 min read");
  });

  it("leaves length and date off entries that carry neither", () => {
    const [group] = groupArticlesForIndex([entry({ tags: [] })]);

    expect(group.articles[0].lengthLabel).toBeUndefined();
    expect(group.articles[0].dateLabel).toBeUndefined();
  });

  it("formats publication dates down to month and year", () => {
    const [group] = groupArticlesForIndex([
      entry({ tags: [], publicationDate: "2021-05-08T00:00:00.000Z" }),
    ]);

    expect(group.articles[0].dateLabel).toBe("May 2021");
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
