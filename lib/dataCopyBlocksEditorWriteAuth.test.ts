import { afterEach, describe, expect, it, vi } from "vitest";
import { getAll, remove, upsert } from "../server/copyBlocks";

type Role = "admin" | "editor" | "viewer";
type IndexFilter = { eq: (field: string, value: unknown) => IndexFilter };

// `withPublicationOutbox` re-reads every row a mutation writes to decide whether
// the write changed public content, so the fake writer keeps what it was handed
// instead of discarding it.
const documents = new Map<string, Record<string, unknown>>();

const insert = vi.fn(async (table: string, document: Record<string, unknown>) => {
  const id = table === "copyBlocks" ? "copy-block-id" : `${table}-id`;
  documents.set(id, { _id: id, ...document });
  return id;
});
const patch = vi.fn(async (id: string, document: Record<string, unknown>) => {
  documents.set(id, { ...documents.get(id), ...document, _id: id });
});
const remove_ = vi.fn(async (id: string) => {
  documents.delete(id);
});
const collect = vi.fn(async () => [] as unknown[]);

/**
 * Mirrors the ctx shape in `dataSubstanceIndexEditorReadAuth.test.ts`, plus
 * the `copyBlocks` by-key lookup the upsert performs once authorized.
 */
function createCtx({
  identity,
  memberships = {},
  existingBlock = null,
}: {
  identity?: { subject: string; email?: string; name?: string } | null;
  memberships?: Record<string, Role>;
  existingBlock?: { _id: string; key: string } | null;
}) {
  return {
    auth: {
      getUserIdentity: vi.fn(async () => identity ?? null),
    },
    db: {
      normalizeId: () => null, // Copy blocks are not indexed source tables.
      get: vi.fn(async (id: string) => documents.get(id) ?? existingBlock),
      insert,
      patch,
      delete: remove_,
      query: vi.fn((table: string) => {
        if (table === "copyBlocks") {
          return {
            collect,
            withIndex: () => ({
              first: vi.fn(async () => existingBlock),
            }),
          };
        }

        if (table === "contentRevisions") {
          const cursor = {
            order: () => cursor,
            first: async () => null,
            unique: async () => null,
          };
          return {
            withIndex: (
              _indexName: string,
              selector: (query: IndexFilter) => unknown,
            ) => {
              const query: IndexFilter = { eq: () => query };
              selector(query);
              return cursor;
            },
          };
        }

        return {
          withIndex: (
            _indexName: string,
            selector: (query: IndexFilter) => unknown,
          ) => {
            let email = "";
            const query: IndexFilter = {
              eq: (field, value) => {
                if (field === "email" && typeof value === "string") email = value;
                return query;
              },
            };
            selector(query);

            return {
              unique: vi.fn(async () => {
                const role = memberships[email];
                return role ? { email, role } : null;
              }),
            };
          },
        };
      }),
    },
  } as never;
}

// Postgres registered functions keep the original handler on `_handler`; there is
// no in-repo Postgres runtime harness, so the handler is exercised directly.
function handlerOf(fn: unknown) {
  return (fn as { _handler: (ctx: never, args: unknown) => Promise<unknown> })._handler;
}

const upsertHandler = handlerOf(upsert);
const removeHandler = handlerOf(remove);
const getAllHandler = handlerOf(getAll);

const validBlock = {
  key: "home-hero-title",
  kind: "markdown" as const,
  body: "Know what you are taking.",
  label: "Home hero title",
  group: "Home",
};

describe("copyBlocks write authorization", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
    delete process.env.DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE;
    insert.mockClear();
    patch.mockClear();
    remove_.mockClear();
    collect.mockClear();
    documents.clear();
  });

  it("rejects anyone below admin on the upsert, an editor included", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    // An editor's copy edits arrive as change proposals; the direct upsert is
    // refused at the handler seam so a misconfigured route cannot escalate.
    for (const actorEmail of ["viewer@example.com", "editor@example.com"]) {
      await expect(
        upsertHandler(
          createCtx({
            identity: null,
            memberships: { "viewer@example.com": "viewer", "editor@example.com": "editor" },
          }),
          { ...validBlock, apiKey: "secret", actorEmail },
        ),
      ).rejects.toThrow("Admin access required");
    }

    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("rejects a delete from anyone below admin before touching the table", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    for (const actorEmail of ["viewer@example.com", "editor@example.com"]) {
      await expect(
        removeHandler(
          createCtx({
            identity: null,
            memberships: { "viewer@example.com": "viewer", "editor@example.com": "editor" },
          }),
          { key: "home-hero-title", apiKey: "secret", actorEmail },
        ),
      ).rejects.toThrow("Admin access required");
    }

    expect(remove_).not.toHaveBeenCalled();
  });

  it("inserts a new block for a delegated admin actor", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    await expect(
      upsertHandler(
        createCtx({ identity: null, memberships: { "admin@example.com": "admin" } }),
        { ...validBlock, apiKey: "secret", actorEmail: "admin@example.com" },
      ),
    ).resolves.toMatchObject({ updated: false, key: "home-hero-title" });

    expect(insert.mock.calls.filter(([table]) => table === "copyBlocks")).toHaveLength(1);
    expect(insert.mock.calls[0]?.[1]).toMatchObject({
      key: "home-hero-title",
      kind: "markdown",
      body: "Know what you are taking.",
      updatedBy: "admin@example.com",
    });
  });

  it("lets an admin attribute the write to someone else, as approveAndApply does", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    await upsertHandler(
      createCtx({ identity: null, memberships: { "admin@example.com": "admin" } }),
      { ...validBlock, apiKey: "secret", actorEmail: "admin@example.com", updatedBy: "approver@example.com" },
    );

    expect(insert.mock.calls[0]?.[1]).toMatchObject({ updatedBy: "approver@example.com" });
  });

  it("patches the existing row for the same key rather than duplicating it", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    await expect(
      upsertHandler(
        createCtx({
          identity: null,
          memberships: { "admin@example.com": "admin" },
          existingBlock: { _id: "existing-id", key: "home-hero-title" },
        }),
        { ...validBlock, apiKey: "secret", actorEmail: "admin@example.com" },
      ),
    ).resolves.toMatchObject({ updated: true, id: "existing-id" });

    expect(patch).toHaveBeenCalledWith("existing-id", expect.objectContaining({
      key: "home-hero-title",
      body: validBlock.body,
    }));
    expect(insert.mock.calls.filter(([table]) => table === "copyBlocks")).toEqual([]);
  });

  it("clears the payload field the kind does not own", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    await upsertHandler(
      createCtx({ identity: null, memberships: { "admin@example.com": "admin" } }),
      {
        key: "home-hero-points",
        kind: "list",
        items: ["  first  ", "", "second"],
        body: "leftover prose",
        label: "Home hero points",
        group: "Home",
        apiKey: "secret",
        actorEmail: "admin@example.com",
      },
    );

    expect(insert.mock.calls[0]?.[1]).toMatchObject({
      items: ["first", "second"],
      body: undefined,
    });
  });

  it("refuses a key that is not kebab-case", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    await expect(
      upsertHandler(
        createCtx({ identity: null, memberships: { "admin@example.com": "admin" } }),
        { ...validBlock, key: "Home Hero", apiKey: "secret", actorEmail: "admin@example.com" },
      ),
    ).rejects.toThrow();

    expect(insert).not.toHaveBeenCalled();
  });

  it("serves the whole table to an unauthenticated reader", async () => {
    const blocks = [
      { _id: "copy-hero", key: "home-hero", kind: "plain", body: "Public hero" },
      { _id: "copy-points", key: "home-points", kind: "list", items: ["First", "Second"] },
    ];
    collect.mockResolvedValueOnce(blocks);

    await expect(getAllHandler(createCtx({ identity: null }), {})).resolves.toEqual(blocks);
  });
});
