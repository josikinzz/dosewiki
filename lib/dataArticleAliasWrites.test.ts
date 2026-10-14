import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setArticleFieldHandler } from "../server/lib/substanceWriteHandlers";
import { articleBaseHash, loadArticle } from "../server/lib/articleRevisionJournal";
import { articleDocument } from "../server/lib/articleLifecycleValidation";
import { SERVER_KEY, admin, createCtx, editor, storedLsd } from "./changeProposalReviewFixture";

const PATH = "identification.alternative_names";
const OLD = ["Acid", "Lysergide"];
const NEXT = [...OLD, "麦角酸二乙酰胺"];
const asAdmin = { apiKey: SERVER_KEY, actorEmail: admin.email as string };

beforeEach(() => {
  vi.stubEnv("DATA_ADMIN_KEY", SERVER_KEY);
  vi.stubEnv("DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE", undefined);
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
});
afterEach(() => vi.unstubAllEnvs());

function seed() {
  return createCtx({
    memberships: [admin, editor],
    substanceIndex: [{ ...storedLsd, identification: { ...(storedLsd.identification as object), alternative_names: OLD } }],
  });
}

async function request(ctx: ReturnType<typeof seed>["ctx"]) {
  const before = articleDocument(await loadArticle(ctx, "lsd"));
  return {
    ...asAdmin, slug: "lsd", path: PATH, value: NEXT, expected: OLD,
    baseHash: await articleBaseHash(ctx, before), changeId: "reviewed-alias-0001",
  };
}

describe("guarded alias field handler", () => {
  it("refuses field CAS conflicts and whole-article CAS conflicts without writes", async () => {
    for (const failure of ["field", "base"] as const) {
      const { ctx, db, rowsOf } = seed();
      const args = await request(ctx);
      if (failure === "field") args.expected = ["Different"];
      else await db.patch("s1", { summary: "Someone else edited this" });
      db.patch.mockClear();
      await expect(setArticleFieldHandler(ctx, args as never)).rejects.toMatchObject({ data: { code: failure === "field" ? "FIELD_CONFLICT" : "ARTICLE_CONFLICT" } });
      expect(db.patch).not.toHaveBeenCalled();
      expect(rowsOf("articleRevisions").size).toBe(0);
    }
  });

  it("requires the registered admin and editorArticleWrite credential", async () => {
    for (const actorEmail of [undefined, editor.email as string, "absent@example.com"]) {
      const { ctx, db } = seed();
      const args = await request(ctx);
      await expect(setArticleFieldHandler(ctx, { ...args, actorEmail } as never)).rejects.toThrow(/admin|Admin/);
      expect(db.patch).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    }
    vi.stubEnv("DATA_ADMIN_KEY", undefined);
    vi.stubEnv("DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE", "scoped-editor-token");
    const { ctx, db } = seed();
    const args = await request(ctx);
    await expect(setArticleFieldHandler(ctx, args as never)).rejects.toThrow(/Invalid API key/);
    expect(db.patch).not.toHaveBeenCalled();
    await expect(setArticleFieldHandler(ctx, { ...args, apiKey: "scoped-editor-token" } as never)).resolves.toMatchObject({ value: NEXT });
  });

  it.each([PATH, "identification.%61lternative_names"])("fails closed under the write freeze at %s before database access", async (path) => {
    const { ctx, db } = seed();
    const args = await request(ctx);
    db.query.mockClear();
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    await expect(setArticleFieldHandler(ctx, { ...args, path } as never)).rejects.toMatchObject({ code: "DATA_WRITES_FROZEN" });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
