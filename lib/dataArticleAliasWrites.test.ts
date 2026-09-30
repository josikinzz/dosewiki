import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyEditableFieldWrite } from "../server/lib/articleFieldWrites";
import { setArticleFieldHandler } from "../server/lib/substanceWriteHandlers";
import { articleBaseHash, loadArticle } from "../server/lib/articleRevisionJournal";
import { articleDocument } from "../server/lib/articleLifecycleValidation";
import { setArticleField } from "../server/substanceIndex";
import { validateValue } from "./postgres/runtime/validate";
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

describe("append-only alternative names", () => {
  it("appends exact names while cloning identification and preserving its other fields", () => {
    const document = { title: "LSD", identification: { alternative_names: OLD, common_name: "LSD", cas_number: "50-37-3" }, summary: "Untouched" };
    const before = structuredClone(document);
    const result = applyEditableFieldWrite(document, PATH, NEXT as never, { expected: OLD as never });
    expect(result).toMatchObject({ ok: true, topLevelKey: "identification", value: NEXT, topLevelValue: { ...document.identification, alternative_names: NEXT } });
    expect(document).toEqual(before);
    if (result.ok) expect(result.topLevelValue).not.toBe(document.identification);
  });

  it("accepts the first reviewed alias only against an explicit empty baseline", () => {
    const document = { identification: { alternative_names: [], common_name: "Caffeine" } };
    expect(applyEditableFieldWrite(document, PATH, ["咖啡因"], { expected: [] }))
      .toMatchObject({ ok: true, value: ["咖啡因"] });
    expect(applyEditableFieldWrite(document, PATH, ["咖啡因"]))
      .toMatchObject({ ok: false });
  });

  it.each(["title", "summary", "identification.common_name", "classification.psychoactive_class", "identification.alternative_names[0]"])("does not admit an array at %s", (path) => {
    expect(applyEditableFieldWrite({ title: "LSD", summary: "Text", identification: { common_name: "LSD", alternative_names: OLD } }, path, NEXT as never, { expected: OLD as never })).toMatchObject({ ok: false });
  });

  it.each([["Acid"], ["Lysergide", "Acid", "中文"], ["Changed", "Lysergide", "中文"]])("refuses removal, reordering or replacement: %j", (...value) => {
    expect(applyEditableFieldWrite({ identification: { alternative_names: OLD } }, PATH, value as never, { expected: OLD as never })).toMatchObject({ ok: false, reason: expect.stringMatching(/preserve|append/i) });
  });

  it.each([
    [...OLD, ""], [...OLD, " "], [...OLD, " 中文"], [...OLD, "中文\n"], [...OLD, "Acid"],
    [...OLD, 2], [...OLD, "x".repeat(513)], Array.from({ length: 129 }, (_, i) => `name-${i}`),
    Array.from({ length: 64 }, (_, i) => `${i}-${"x".repeat(300)}`),
  ].map((value) => [value]))("refuses invalid or unbounded names", (value) => {
    expect(applyEditableFieldWrite({ identification: { alternative_names: OLD } }, PATH, value as never, { expected: OLD as never })).toMatchObject({ ok: false });
  });

  it("requires a complete array baseline and refuses stale ordering or content", () => {
    const document = { identification: { alternative_names: OLD } };
    expect(applyEditableFieldWrite(document, PATH, NEXT as never)).toMatchObject({ ok: false });
    for (const expected of ["Acid", ["Acid"], [...OLD].reverse(), [...OLD, "Other"]]) {
      const result = applyEditableFieldWrite(document, PATH, NEXT as never, { expected: expected as never });
      expect(result).toMatchObject({ ok: false });
      if (Array.isArray(expected)) expect(result).toMatchObject({ conflict: true });
    }
    expect(applyEditableFieldWrite({ identification: { alternative_names: "Acid" } }, PATH, NEXT as never, { expected: OLD as never })).toMatchObject({ ok: false });
  });
});

describe("guarded alias field handler", () => {
  it("preserves legacy identification siblings and absent defaults through validation, journaling and replay", async () => {
    const identification: Record<string, unknown> = {
      ...(storedLsd.identification as object), alternative_names: OLD,
      retained_legacy_identifier: "retain-me",
    };
    delete identification.botanical_name;
    const { ctx, rowsOf, db } = createCtx({
      memberships: [admin], substanceIndex: [{ ...storedLsd, identification }],
    });
    const args = await request(ctx);
    const before = articleDocument(await loadArticle(ctx, "lsd"));
    const result = await setArticleFieldHandler(ctx, args as never);
    const after = articleDocument(await loadArticle(ctx, "lsd"));
    const expected = { ...before, identification: { ...identification, alternative_names: NEXT } };
    expect(after).toEqual(expected);
    expect(Object.prototype.hasOwnProperty.call(after.identification, "botanical_name")).toBe(false);
    expect(db.patch.mock.calls.find(([id]) => id === "s1")?.[1])
      .toEqual({ identification: expected.identification });
    expect([...rowsOf("articleRevisions").values()][0]).toMatchObject({ before, after: expected });
    expect(result.topLevelValue).toEqual(expected.identification);
    expect(result.baseHash).toBe(await articleBaseHash(ctx, after));
    db.patch.mockClear();
    db.insert.mockClear();
    await expect(setArticleFieldHandler(ctx, args as never)).resolves.toEqual(result);
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("accepts arrays through the actual callable validator and journals only identification", async () => {
    const { ctx, rowsOf, db } = seed();
    const args = await request(ctx);
    expect(() => validateValue(setArticleField.args, args, "args")).not.toThrow();
    expect(() => validateValue(setArticleField.args, { ...args, value: [2] }, "args")).toThrow();
    const before = articleDocument(await loadArticle(ctx, "lsd"));
    const result = await setArticleFieldHandler(ctx, args as never);
    const after = articleDocument(await loadArticle(ctx, "lsd"));
    expect(after).toEqual({ ...before, identification: { ...before.identification, alternative_names: NEXT } });
    expect(result.baseHash).toBe(await articleBaseHash(ctx, after));
    expect(rowsOf("articleRevisions").size).toBe(1);
    expect(rowsOf("changelog").size).toBe(1);
    expect(db.patch.mock.calls.find(([id]) => id === "s1")?.[1]).toEqual({ identification: after.identification });
    expect([...rowsOf("articleRevisions").values()][0]).toMatchObject({ actorEmail: admin.email, baseHash: args.baseHash, changeId: args.changeId, before, after });
  });

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

  it.each([
    { path: "summary", value: NEXT },
    { path: PATH, value: ["Acid"] },
    { path: PATH, value: [...OLD, ""] },
  ])("refuses array misuse at the handler boundary without writes", async (invalid) => {
    const { ctx, db, rowsOf } = seed();
    const args = await request(ctx);
    await expect(setArticleFieldHandler(ctx, { ...args, ...invalid } as never))
      .rejects.toMatchObject({ data: { code: "FIELD_WRITE_REJECTED" } });
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(rowsOf("articleRevisions").size).toBe(0);
  });

  it("replays the same operation without new writes and refuses a reused change ID", async () => {
    const { ctx, db, rowsOf } = seed();
    const args = await request(ctx);
    const first = await setArticleFieldHandler(ctx, args as never);
    db.patch.mockClear();
    db.insert.mockClear();
    await expect(setArticleFieldHandler(ctx, args as never)).resolves.toEqual(first);
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    await expect(setArticleFieldHandler(ctx, { ...args, value: [...NEXT, "Different"] } as never)).rejects.toMatchObject({ data: { code: "ARTICLE_CHANGE_REUSED" } });
    expect(rowsOf("articleRevisions").size).toBe(1);
  });

  it("does not claim a replay remains current after subsequent article changes", async () => {
    const { ctx, db } = seed();
    const args = await request(ctx);
    await setArticleFieldHandler(ctx, args as never);
    await db.patch("s1", { summary: "Later revision" });
    db.patch.mockClear();
    await expect(setArticleFieldHandler(ctx, args as never)).rejects.toMatchObject({ data: { code: "ARTICLE_CONFLICT" } });
    expect(db.patch).not.toHaveBeenCalled();
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
