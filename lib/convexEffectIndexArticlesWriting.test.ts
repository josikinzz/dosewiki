import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAll,
  getBySlug,
  listForEditor,
  upsertArticle,
} from "../convex/effectIndexArticles";

type Role = "admin" | "editor" | "viewer";

type ArticleRow = {
  _id: string;
  _creationTime: number;
  slug: string;
  title: string;
  tags: string[];
  body_raw: string;
  status?: "draft" | "published";
  kind?: "article" | "blog";
  teaser?: string;
  shortDescription?: string;
  publicationDate?: string;
};

/**
 * Same mocked-ctx shape as `convexSubstanceIndexEditorReadAuth.test.ts`, with a
 * tiny in-memory `effectIndexArticles` table so the draft filter and the patch
 * semantics can be exercised without a Convex runtime.
 */
function createCtx({
  rows = [],
  memberships = {},
}: {
  rows?: ArticleRow[];
  memberships?: Record<string, Role>;
} = {}) {
  const patched: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const inserted: Array<Record<string, unknown>> = [];

  const ctx = {
    auth: { getUserIdentity: vi.fn(async () => null) },
    db: {
      query: vi.fn((table: string) => {
        if (table === "effectIndexArticles") {
          return {
            collect: async () => rows,
            withIndex: (
              _indexName: string,
              selector: (query: { eq: (field: string, value: string) => unknown }) => unknown,
            ) => {
              let slug = "";
              selector({
                eq: (_field, value) => {
                  slug = value;
                  return {};
                },
              });
              return {
                first: async () => rows.find((row) => row.slug === slug) ?? null,
              };
            },
          };
        }

        return {
          withIndex: (
            _indexName: string,
            selector: (query: { eq: (field: string, value: string) => unknown }) => unknown,
          ) => {
            let email = "";
            selector({
              eq: (_field, value) => {
                email = value;
                return {};
              },
            });
            return {
              unique: async () => {
                const role = memberships[email];
                return role ? { email, role } : null;
              },
            };
          },
        };
      }),
      patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
        patched.push({ id, patch });
      }),
      insert: vi.fn(async (_table: string, doc: Record<string, unknown>) => {
        inserted.push(doc);
        return "inserted-id";
      }),
    },
  };

  return { ctx: ctx as never, patched, inserted };
}

function handlerOf(fn: unknown) {
  return (fn as { _handler: (ctx: never, args: unknown) => Promise<unknown> })._handler;
}

const adminArgs = { apiKey: "secret", actorEmail: "admin@example.com" };
const editorArgs = { apiKey: "secret", actorEmail: "editor@example.com" };
const memberships: Record<string, Role> = {
  "admin@example.com": "admin",
  "editor@example.com": "editor",
};

const publishedRow: ArticleRow = {
  _id: "a",
  _creationTime: 1,
  slug: "published-post",
  title: "Published",
  tags: ["blog"],
  body_raw: "body",
};

const draftRow: ArticleRow = {
  _id: "b",
  _creationTime: 2,
  slug: "draft-post",
  title: "Draft",
  tags: ["blog"],
  body_raw: "draft body",
  status: "draft",
  kind: "blog",
};

describe("effectIndexArticles writing extensions", () => {
  afterEach(() => {
    delete process.env.CONVEX_ADMIN_KEY;
    delete process.env.CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE;
  });

  it("excludes drafts from the public list and detail reads", async () => {
    const { ctx } = createCtx({ rows: [publishedRow, draftRow] });

    await expect(handlerOf(getAll)(ctx, {})).resolves.toEqual([publishedRow]);
    await expect(handlerOf(getBySlug)(ctx, { slug: "draft-post" })).resolves.toBeNull();
    await expect(handlerOf(getBySlug)(ctx, { slug: "published-post" })).resolves.toEqual(
      publishedRow,
    );
  });

  it("refuses viewer and editor callers on the upsert while serving the editor listing", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";
    const viewer = createCtx({
      rows: [publishedRow],
      memberships: { "viewer@example.com": "viewer" },
    });

    await expect(
      handlerOf(upsertArticle)(viewer.ctx, {
        apiKey: "secret",
        actorEmail: "viewer@example.com",
        slug: "published-post",
        title: "x",
      }),
    ).rejects.toThrow("Admin access required");

    // An editor reads the listing but publishes only through a proposal: the
    // direct upsert is refused at the handler seam, whatever route called it.
    const editor = createCtx({ rows: [publishedRow], memberships });
    await expect(
      handlerOf(listForEditor)(editor.ctx, editorArgs),
    ).resolves.toHaveLength(1);
    await expect(
      handlerOf(upsertArticle)(editor.ctx, { ...editorArgs, slug: "published-post", title: "x" }),
    ).rejects.toThrow("Admin access required");

    expect(viewer.patched).toHaveLength(0);
    expect(viewer.inserted).toHaveLength(0);
    expect(editor.patched).toHaveLength(0);
    expect(editor.inserted).toHaveLength(0);
  });

  it("serves the slim editor listing, drafts included, without bodies", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";
    const { ctx } = createCtx({
      rows: [publishedRow, draftRow],
      memberships,
    });

    const listed = (await handlerOf(listForEditor)(ctx, editorArgs)) as Array<
      Record<string, unknown>
    >;

    expect(listed).toHaveLength(2);
    expect(listed[0]).toMatchObject({
      slug: "published-post",
      kind: "article",
      status: "published",
    });
    expect(listed[1]).toMatchObject({ slug: "draft-post", kind: "blog", status: "draft" });
    expect(listed.every((row) => !("body_raw" in row) && !("body_ast" in row))).toBe(true);
  });

  it("patches only the fields the caller sent and never clears the rest", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";
    const { ctx, patched } = createCtx({
      rows: [{ ...publishedRow, teaser: "kept", shortDescription: "kept too" }],
      memberships,
    });

    await expect(
      handlerOf(upsertArticle)(ctx, { ...adminArgs, slug: "published-post", title: "Renamed" }),
    ).resolves.toMatchObject({ slug: "published-post", created: false });

    expect(patched).toHaveLength(1);
    expect(patched[0].patch).toEqual({ title: "Renamed" });
    expect(patched[0].patch).not.toHaveProperty("teaser");
    expect(patched[0].patch).not.toHaveProperty("body_raw");
  });

  it("rejects an invalid slug and a publish with an empty body", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    const bad = createCtx({ memberships });
    await expect(
      handlerOf(upsertArticle)(bad.ctx, { ...adminArgs, slug: "Not A Slug", title: "x" }),
    ).rejects.toThrow("Invalid slug");

    const empty = createCtx({ memberships });
    await expect(
      handlerOf(upsertArticle)(empty.ctx, {
        ...adminArgs,
        slug: "new-post",
        title: "New",
        status: "published",
        body_raw: "   ",
      }),
    ).rejects.toThrow("Cannot publish an article with an empty body");

    // A draft with an empty body is fine.
    const draft = createCtx({ memberships });
    await expect(
      handlerOf(upsertArticle)(draft.ctx, {
        ...adminArgs,
        slug: "new-post",
        title: "New",
        status: "draft",
        body_raw: "",
      }),
    ).resolves.toMatchObject({ created: true });

    // Publishing an existing row whose stored body is empty is rejected too.
    const storedEmpty = createCtx({
      rows: [{ ...publishedRow, body_raw: "", status: "draft" }],
      memberships,
    });
    await expect(
      handlerOf(upsertArticle)(storedEmpty.ctx, {
        ...adminArgs,
        slug: "published-post",
        status: "published",
      }),
    ).rejects.toThrow("Cannot publish an article with an empty body");
    expect(storedEmpty.patched).toHaveLength(0);
  });
});
