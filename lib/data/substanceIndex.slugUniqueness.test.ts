import { describe, expect, it, vi } from "vitest";
import { getBySlug, getPublicBySlug } from "../../server/substanceIndex";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";

// Postgres registered functions keep the original handler on `_handler`; there is
// no in-repo Postgres runtime harness, so the handler is exercised directly.
const handlerOf = (fn: unknown) =>
  (fn as { _handler: (ctx: never, args: unknown) => Promise<unknown> })._handler;

function createCtx(rows: unknown[]) {
  const take = vi.fn(async (n: number) => rows.slice(0, n));
  const first = vi.fn(async () => {
    throw new Error(".first() hides duplicate slugs");
  });
  const withIndex = vi.fn(
    (_name: string, selector: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      selector({ eq: () => ({}) });
      return { take, first, collect: first };
    },
  );
  return { ctx: { db: { query: () => ({ withIndex }) } } as never, take, withIndex };
}

const article = (slug: string) => ({ ...structuredClone(fullArticleWithDosage), slug });

describe("substanceIndex slug lookups", () => {
  it.each([
    ["getBySlug", getBySlug],
    ["getPublicBySlug", getPublicBySlug],
  ])("%s reads by_slug with take(2) and returns null for zero or duplicate matches", async (_name, fn) => {
    for (const rows of [[], [article("lsd"), article("lsd")]]) {
      const { ctx, take, withIndex } = createCtx(rows);
      await expect(handlerOf(fn)(ctx, { slug: "lsd" })).resolves.toBeNull();
      expect(withIndex.mock.calls[0][0]).toBe("by_slug");
      expect(take).toHaveBeenCalledWith(2);
    }
    const { ctx } = createCtx([article("lsd")]);
    await expect(handlerOf(fn)(ctx, { slug: "lsd" })).resolves.toMatchObject({ slug: "lsd" });
  });

  it("getPublicBySlug projects the single match publicly", async () => {
    const { ctx } = createCtx([{ ...article("lsd"), editorial_review: { status: "needed" } }]);
    const result = (await handlerOf(getPublicBySlug)(ctx, { slug: "lsd" })) as Record<string, unknown>;
    expect(result).not.toHaveProperty("editorial_review");
  });
});
