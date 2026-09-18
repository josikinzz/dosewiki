import { describe, expect, it } from "vitest";
import {
  CURATED_ARTICLES,
  EXCLUDED_ARTICLES,
  curatedPublicationStatus,
  partitionCuratedArticles,
} from "../scripts/migrate/articles/curation.mjs";
import { transformArticle } from "../scripts/migrate/articles/transform.mjs";

const DUMP_SLUGS = [
  ...CURATED_ARTICLES.keys(),
  ...EXCLUDED_ARTICLES.keys(),
].map((slug) => ({ slug }));

describe("migrate-articles curation list", () => {
  it("ports exactly the nine approved articles, all published", () => {
    expect(CURATED_ARTICLES.size).toBe(9);
    expect([...CURATED_ARTICLES.values()]).toEqual(
      Array.from({ length: 9 }, () => "published"),
    );
    expect([...CURATED_ARTICLES.keys()].sort()).toEqual(
      [
        "approximate-frequency-of-occurrence-scale",
        "dissociative-intensity-scale",
        "dmt",
        "dreams",
        "duration-terminology-explanation",
        "dxm",
        "lucid-dreaming",
        "meditation",
        "psychedelic-intensity-scale",
      ],
    );
  });

  it("skips the ten working documents without importing them", () => {
    expect(EXCLUDED_ARTICLES.size).toBe(10);
    const { ported, skipped } = partitionCuratedArticles(DUMP_SLUGS);
    expect(ported).toHaveLength(9);
    expect(skipped.map(({ slug }) => slug).sort()).toEqual(
      [...EXCLUDED_ARTICLES.keys()].sort(),
    );
    for (const { reason } of skipped) expect(reason).toBeTruthy();
  });

  it("fails loudly on a dump slug that is on neither list", () => {
    expect(() =>
      partitionCuratedArticles([...DUMP_SLUGS, { slug: "brand-new-article" }]),
    ).toThrow(/brand-new-article/);
  });

  it("fails loudly when a curated slug is missing from the dump", () => {
    expect(() =>
      partitionCuratedArticles(DUMP_SLUGS.filter(({ slug }) => slug !== "dreams")),
    ).toThrow(/missing from the Effect Index dump: dreams/);
  });

  it("rejects duplicate slugs", () => {
    expect(() =>
      partitionCuratedArticles([...DUMP_SLUGS, { slug: "dmt" }]),
    ).toThrow(/duplicate slug: dmt/);
  });

  it("refuses to hand out a publication status for an uncurated slug", () => {
    expect(() => curatedPublicationStatus("funding-proposal")).toThrow(
      /not on the curation list/,
    );
  });
});

describe("migrate-articles helpers", () => {
  it("overrides the dump's publication status with the curated one", () => {
    // dxm is "unlisted" upstream; the curation list publishes it.
    const { article } = transformArticle({
      slug: "dxm",
      title: "DXM",
      publication_status: "unlisted",
      body: { raw: "[p]Plateaus.[/p]", parsed: null },
    });
    expect(article.publication_status).toBe("published");
  });

  it("corrects the misspelled psychonautics tag without disturbing its siblings", () => {
    // The dump spells it "psychoanautics" on this article alone, which would
    // split one subject across two grouping keys on the articles index.
    const { article } = transformArticle({
      slug: "lucid-dreaming",
      title: "Lucid dreaming",
      tags: ["dreams", "psychoanautics", "subjective effect documentation"],
      body: { raw: "[p]Wake back to bed.[/p]", parsed: null },
    });

    expect(article.tags).toEqual([
      "dreams",
      "psychonautics",
      "subjective effect documentation",
    ]);
  });

  it("does not duplicate a tag when the correction collides with an existing one", () => {
    const { article } = transformArticle({
      slug: "meditation",
      title: "Meditation",
      tags: ["psychonautics", "psychoanautics"],
      body: { raw: "[p]Sit.[/p]", parsed: null },
    });

    expect(article.tags).toEqual(["psychonautics"]);
  });

  it("refuses to transform an article that is not on the curation list", () => {
    expect(() =>
      transformArticle({
        slug: "dmt-video-script",
        title: "DMT Video Script",
        body: { raw: "[p]Read aloud.[/p]", parsed: null },
      }),
    ).toThrow(/not on the curation list/);
  });

  it("preserves identity and publication status while rewriting raw and parsed VCode", () => {
    const transformed = transformArticle(
      {
        slug: "dxm",
        title: "DXM",
        publication_status: "unlisted",
        tags: ["intensity scale"],
        featured: false,
        short_description: "A plateau guide.",
        publication_date: { $date: "2021-06-17T00:00:00Z" },
        authors: [{ $oid: "author-1" }],
        citations: [],
        body: {
          raw: '[p][int-link to="/summaries/dissociatives"]Dissociatives[/int-link][/p]',
          parsed: [
            {
              name: "p",
              properties: {},
              children: [
                {
                  name: "int-link",
                  properties: { to: "/summaries/dissociatives" },
                  children: ["Dissociatives"],
                },
                {
                  name: "captioned-image",
                  properties: { src: "/img/gallery/example.jpg" },
                  children: null,
                },
              ],
            },
          ],
        },
      },
      new Map([
        [
          "/img/gallery/example.jpg",
          "https://cdn.example.test/example.jpg",
        ],
      ]),
    );

    expect(transformed.issues).toEqual([]);
    expect(transformed.article).toMatchObject({
      slug: "dxm",
      title: "DXM",
      publication_status: "published",
      shortDescription: "A plateau guide.",
      publicationDate: "2021-06-17T00:00:00Z",
      authors: ["author-1"],
      body_raw:
        '[p][int-link to="/psychoactive/dissociative"]Dissociatives[/int-link][/p]',
    });
    expect(transformed.article.body_ast).toEqual([
      {
        name: "p",
        properties: {},
        children: [
          {
            name: "int-link",
            properties: { to: "/psychoactive/dissociative" },
            children: ["Dissociatives"],
          },
          {
            name: "captioned-image",
            properties: {
              src: "https://cdn.example.test/example.jpg",
            },
            children: [],
          },
        ],
      },
    ]);
  });
});
