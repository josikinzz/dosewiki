import { afterEach, describe, expect, it, vi } from "vitest";
import { getAll, remove, upsert } from "../convex/copyBlocks";

type Role = "admin" | "editor" | "viewer";

const insert = vi.fn(
  async (_table: string, _document: Record<string, unknown>) => "copy-block-id",
);
const patch = vi.fn(async () => undefined);
const remove_ = vi.fn(async () => undefined);
const collect = vi.fn(async () => [] as unknown[]);

/**
 * Mirrors the ctx shape in `convexSubstanceIndexEditorReadAuth.test.ts`, plus
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

// Convex registered functions keep the original handler on `_handler`; there is
// no in-repo Convex runtime harness, so the handler is exercised directly.
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
    delete process.env.CONVEX_ADMIN_KEY;
    delete process.env.CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE;
    insert.mockClear();
    patch.mockClear();
    remove_.mockClear();
    collect.mockClear();
  });

  it("rejects an unauthenticated caller before writing any copy block", async () => {
    await expect(upsertHandler(createCtx({ identity: null }), validBlock)).rejects.toThrow(
      "Authentication required",
    );

    expect(insert).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("rejects an invalid API key and a non-editor membership", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    await expect(
      upsertHandler(createCtx({ identity: null }), { ...validBlock, apiKey: "wrong" }),
    ).rejects.toThrow("Authentication failed: Invalid API key");

    await expect(
      upsertHandler(
        createCtx({ identity: null, memberships: { "viewer@example.com": "viewer" } }),
        { ...validBlock, apiKey: "secret", actorEmail: "viewer@example.com" },
      ),
    ).rejects.toThrow("Editor access required");

    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a delete from a non-editor before touching the table", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    await expect(
      removeHandler(
        createCtx({ identity: null, memberships: { "viewer@example.com": "viewer" } }),
        { key: "home-hero-title", apiKey: "secret", actorEmail: "viewer@example.com" },
      ),
    ).rejects.toThrow("Editor access required");

    expect(remove_).not.toHaveBeenCalled();
  });

  it("inserts a new block for a delegated editor actor", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    await expect(
      upsertHandler(
        createCtx({ identity: null, memberships: { "editor@example.com": "editor" } }),
        { ...validBlock, apiKey: "secret", actorEmail: "editor@example.com" },
      ),
    ).resolves.toMatchObject({ updated: false, key: "home-hero-title" });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[1]).toMatchObject({
      key: "home-hero-title",
      kind: "markdown",
      body: "Know what you are taking.",
      updatedBy: "editor@example.com",
    });
  });

  it("patches the existing row for the same key rather than duplicating it", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    await expect(
      upsertHandler(
        createCtx({
          identity: null,
          memberships: { "editor@example.com": "editor" },
          existingBlock: { _id: "existing-id", key: "home-hero-title" },
        }),
        { ...validBlock, apiKey: "secret", actorEmail: "editor@example.com" },
      ),
    ).resolves.toMatchObject({ updated: true, id: "existing-id" });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it("clears the payload field the kind does not own", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    await upsertHandler(
      createCtx({ identity: null, memberships: { "editor@example.com": "editor" } }),
      {
        key: "home-hero-points",
        kind: "list",
        items: ["  first  ", "", "second"],
        body: "leftover prose",
        label: "Home hero points",
        group: "Home",
        apiKey: "secret",
        actorEmail: "editor@example.com",
      },
    );

    expect(insert.mock.calls[0]?.[1]).toMatchObject({
      items: ["first", "second"],
      body: undefined,
    });
  });

  it("refuses a key that is not kebab-case", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    await expect(
      upsertHandler(
        createCtx({ identity: null, memberships: { "editor@example.com": "editor" } }),
        { ...validBlock, key: "Home Hero", apiKey: "secret", actorEmail: "editor@example.com" },
      ),
    ).rejects.toThrow();

    expect(insert).not.toHaveBeenCalled();
  });

  it("serves the whole table to an unauthenticated reader", async () => {
    await expect(getAllHandler(createCtx({ identity: null }), {})).resolves.toEqual([]);
    expect(collect).toHaveBeenCalledTimes(1);
  });
});
