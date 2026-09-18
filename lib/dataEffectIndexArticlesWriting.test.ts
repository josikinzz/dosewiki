import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAll,
  getBySlug,
  listForEditor,
  upsertArticle,
} from "../server/effectIndexArticles";
import { contentHash } from "./proposals/contentHash";
import { narrativeRevision } from "../server/lib/narrativeRevisions";

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
 * Same mocked-ctx shape as `dataSubstanceIndexEditorReadAuth.test.ts`, with a
 * tiny in-memory `effectIndexArticles` table so the draft filter and the patch
 * semantics can be exercised without a Postgres runtime.
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
  const revisions: Array<Record<string, unknown>> = [];
  rows = rows.map(row => ({ ...row }));

  const ctx = {
    auth: { getUserIdentity: vi.fn(async () => null) },
    db: {
      normalizeId: () => null, // Effect Index posts are not indexed source tables.
      get: async (id: string) => rows.find(row => row._id === id) ?? null,
      query: vi.fn((table: string) => {
        if (table === "narrativeRevisions") {
          return { withIndex: (_name: string, selector: (query: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
            const filters: Record<string, unknown> = {};
            const builder = { eq(field: string, value: unknown) { filters[field] = value; return builder; } };
            selector(builder);
            return {
              first: async () => revisions.find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null,
              order: () => ({ first: async () => {
                for (let index = revisions.length - 1; index >= 0; index--) {
                  const row = revisions[index];
                  if (Object.entries(filters).every(([key, value]) => row[key] === value)) return row;
                }
                return null;
              } }),
            };
          } };
        }
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
        const index = rows.findIndex(row => row._id === id);
        if (index >= 0) rows[index] = { ...rows[index], ...patch };
      }),
      insert: vi.fn(async (table: string, doc: Record<string, unknown>) => {
        if (table === "narrativeRevisions") { revisions.push(doc); return `revision-${revisions.length}`; }
        inserted.push(doc);
        const id = `inserted-${inserted.length}`;
        rows.push({ ...doc, _id: id, _creationTime: 100 } as ArticleRow);
        return id;
      }),
    },
  };

  return { ctx: ctx as never, patched, inserted, revisions };
}

function handlerOf(fn: unknown) {
  return (fn as { _handler: (ctx: never, args: unknown) => Promise<unknown> })._handler;
}

const adminArgs = { apiKey: "secret", actorEmail: "admin@example.com", expectedRevision: contentHash(null), operationId: "11111111-1111-4111-8111-111111111111" };
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
    delete process.env.DATA_ADMIN_KEY;
    delete process.env.DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE;
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
    process.env.DATA_ADMIN_KEY = "secret";
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

    // Editors can read and preview, but no writing proposal type grants publication.
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
    process.env.DATA_ADMIN_KEY = "secret";
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
    process.env.DATA_ADMIN_KEY = "secret";
    const source = { ...publishedRow, teaser: "kept", shortDescription: "kept too" };
    const { ctx } = createCtx({ rows: [source], memberships });

    await expect(
      handlerOf(upsertArticle)(ctx, { ...adminArgs, expectedRevision: narrativeRevision(source), slug: "published-post", title: "Renamed" }),
    ).resolves.toMatchObject({ slug: "published-post", created: false });

    await expect(handlerOf(getBySlug)(ctx, { slug: "published-post" })).resolves.toMatchObject({ title: "Renamed", teaser: "kept", shortDescription: "kept too", body_raw: "body" });
  });

  it("rejects an invalid slug and a publish with an empty body", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

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
        expectedRevision: narrativeRevision({ ...publishedRow, body_raw: "", status: "draft" }),
        slug: "published-post",
        status: "published",
      }),
    ).rejects.toThrow("Cannot publish an article with an empty body");
    expect(storedEmpty.patched).toHaveLength(0);
  });
  it("rejects a stale baseline and reconciles an identical lost-response retry without duplicate history", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const { ctx, revisions } = createCtx({ rows: [publishedRow], memberships });
    const request = { ...adminArgs, expectedRevision: narrativeRevision(publishedRow), slug: publishedRow.slug, title: "Updated" };
    const result = await handlerOf(upsertArticle)(ctx, request);
    await expect(handlerOf(upsertArticle)(ctx, request)).resolves.toEqual(expect.objectContaining(result as object));
    expect(revisions).toHaveLength(1);
    await expect(handlerOf(upsertArticle)(ctx, { ...request, operationId: "22222222-2222-4222-8222-222222222222", title: "Stale overwrite" })).rejects.toThrow();
    await expect(handlerOf(getBySlug)(ctx, { slug: publishedRow.slug })).resolves.toMatchObject({ title: "Updated" });
    expect(revisions).toHaveLength(1);
  });
  it("rejects an editor loaded before an A-to-B-to-A publication cycle", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const { ctx, revisions } = createCtx({ rows: [publishedRow], memberships });
    const baseline = narrativeRevision(publishedRow);
    const first = await handlerOf(upsertArticle)(ctx, { ...adminArgs, expectedRevision: baseline, slug: publishedRow.slug, title: "B" }) as { revision: string };
    const second = await handlerOf(upsertArticle)(ctx, { ...adminArgs, expectedRevision: first.revision, operationId: "22222222-2222-4222-8222-222222222222", slug: publishedRow.slug, title: publishedRow.title }) as { revision: string };
    expect(second.revision).not.toBe(baseline);
    await expect(handlerOf(upsertArticle)(ctx, { ...adminArgs, expectedRevision: baseline, operationId: "33333333-3333-4333-8333-333333333333", slug: publishedRow.slug, title: "Stale edit" })).rejects.toThrow();
    await expect(handlerOf(getBySlug)(ctx, { slug: publishedRow.slug })).resolves.toMatchObject(publishedRow);
    expect(revisions).toHaveLength(2);
  });
});
