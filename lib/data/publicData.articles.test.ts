import { describe, expect, it } from "vitest";
import { createDataPublicDataReadAdapter } from "./publicData.reads";

describe("public Effect Index article data adapters", () => {
  it("reads all article routes while exposing only published article previews", async () => {
    const queryCalls: Array<[string, Record<string, unknown>]> = [];
    const records = [
      {
        slug: "lucid-dreaming",
        title: "Lucid dreaming",
        publication_status: "published",
        tags: ["dreams"],
        featured: true,
        body_raw: "[p]Lucid dreaming.[/p]",
        body_ast: {
          name: "p",
          properties: {},
          children: ["Lucid dreaming."],
        },
      },
      {
        slug: "dxm",
        title: "DXM",
        publication_status: "unlisted",
        tags: ["intensity scale"],
        body_raw: "[p]DXM plateaus.[/p]",
      },
    ];
    const query = async <Result, Args extends Record<string, unknown>>(
      name: string,
      args: Args,
    ): Promise<Result> => {
      queryCalls.push([name, args]);
      if (name === "effectIndexArticles:getBySlug") {
        return records.find((record) => record.slug === args.slug) as Result;
      }
      return records as Result;
    };

    const adapter = createDataPublicDataReadAdapter(query);

    await expect(adapter.getPublicEffectIndexArticles()).resolves.toHaveLength(2);
    await expect(adapter.getPublishedEffectIndexArticles()).resolves.toEqual([
      expect.objectContaining({
        slug: "lucid-dreaming",
        publication_status: "published",
      }),
    ]);
    await expect(adapter.getPublicEffectIndexArticleBySlug("dxm")).resolves.toMatchObject({
      slug: "dxm",
      publication_status: "unlisted",
    });

    expect(queryCalls).toEqual([
      ["effectIndexArticles:getAll", {}],
      ["effectIndexArticles:getAll", {}],
      ["effectIndexArticles:getBySlug", { slug: "dxm" }],
    ]);
  });

  it("drops draft rows from both the list and the detail read", async () => {
    const records = [
      {
        slug: "published-post",
        title: "Published",
        publication_status: "published",
        tags: ["blog"],
        body_raw: "[p]Live.[/p]",
      },
      {
        slug: "draft-post",
        title: "Draft",
        publication_status: "published",
        status: "draft",
        tags: ["blog"],
        body_raw: "[p]Unfinished.[/p]",
      },
    ];
    const query = async <Result, Args extends Record<string, unknown>>(
      name: string,
      args: Args,
    ): Promise<Result> =>
      (name === "effectIndexArticles:getBySlug"
        ? (records.find((record) => record.slug === args.slug) ?? null)
        : records) as Result;

    const adapter = createDataPublicDataReadAdapter(query);

    await expect(adapter.getPublicEffectIndexArticles()).resolves.toEqual([
      expect.objectContaining({ slug: "published-post" }),
    ]);
    await expect(adapter.getPublishedEffectIndexArticles()).resolves.toEqual([
      expect.objectContaining({ slug: "published-post" }),
    ]);
    await expect(
      adapter.getPublicEffectIndexArticleBySlug("draft-post"),
    ).resolves.toBeNull();
  });

  it("normalizes article VCode from raw text when the stored AST is invalid", async () => {
    const query = async <Result>(): Promise<Result> =>
      ({
        slug: "dreams",
        title: "Dreams",
        publication_status: "published",
        tags: ["dreams"],
        body_raw: "[p]Dream content[/p]",
        body_ast: { type: "doc" },
      }) as Result;

    const article = await createDataPublicDataReadAdapter(
      query,
    ).getPublicEffectIndexArticleBySlug("dreams");

    expect(article?.body_ast).toEqual({
      name: "p",
      properties: {},
      children: ["Dream content"],
    });
  });
});
