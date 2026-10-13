// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { getPublicTranslationTextInputPage } from "../../server/substanceIndex";
import type { QueryCtx } from "../postgres/runtime/server";
import { createDataPublicDataReadAdapter } from "../data/publicData.reads";
import { projectPublicArticle } from "../../src/data/projections/substanceReadProjections";

describe("bounded public translation source pages", () => {
  it("caps rows at 32 and preserves the public article projection and cursor", async () => {
    const document = { ...structuredClone(fullArticleWithDosage), _id: "private-id", _creationTime: 1, slug: "lsd", priority: "normal" as const };
    const paginate = vi.fn(async () => ({ page: [document], continueCursor: "next", isDone: false }));
    const ctx = { db: { query: vi.fn(() => ({ paginate })) } } as unknown as QueryCtx;
    const page = await getPublicTranslationTextInputPage._handler(ctx, { cursor: "before", limit: 100 });
    expect(paginate).toHaveBeenCalledWith({ cursor: "before", numItems: 32 });
    expect(page).toEqual({ items: [projectPublicArticle(document)], cursor: "next", isDone: false });
    expect(page.items[0]).not.toHaveProperty("editorial_review");
  });

  it("drains every page through the bulk adapter without a by-slug query", async () => {
    const article = { ...structuredClone(fullArticleWithDosage), slug: "lsd", priority: "normal" as const };
    const calls: Array<{ name: string; cursor: unknown; limit: unknown }> = [];
    const query = async <Result>(name: string, args: Record<string, unknown> = {}): Promise<Result> => {
      calls.push({ name, cursor: args.cursor, limit: args.limit });
      return { items: [projectPublicArticle({ ...article, slug: args.cursor ? "second" : "first" })], cursor: "next", isDone: Boolean(args.cursor) } as Result;
    };
    const records = await createDataPublicDataReadAdapter(query).getPublicTranslationSubstanceDocuments!();
    expect(records.map((record) => record.slug)).toEqual(["first", "second"]);
    expect(calls).toEqual([
      { name: "substanceIndex:getPublicTranslationTextInputPage", cursor: undefined, limit: 32 },
      { name: "substanceIndex:getPublicTranslationTextInputPage", cursor: "next", limit: 32 },
    ]);
  });
});
