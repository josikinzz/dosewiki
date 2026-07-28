import { describe, expect, it } from "vitest";
import { transformArticle } from "../scripts/migrate/articles/transform.mjs";

describe("migrate-articles helpers", () => {
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
      publication_status: "unlisted",
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
