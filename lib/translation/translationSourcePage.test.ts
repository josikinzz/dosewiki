import { describe, expect, it, vi } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { getPublicTranslationTextInputPage } from "../../server/substanceIndex";
import type { QueryCtx } from "../postgres/runtime/server";
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
});
