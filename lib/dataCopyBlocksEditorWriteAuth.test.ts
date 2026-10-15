import { afterEach, describe, expect, it, vi } from "vitest";
import { remove, upsert } from "../server/copyBlocks";

type Role = "admin" | "editor" | "viewer";
type IndexFilter = { eq: (field: string, value: unknown) => IndexFilter };

const insert = vi.fn(async () => "copy-block-id");
const patch = vi.fn(async () => undefined);
const remove_ = vi.fn(async () => undefined);

function createCtx({
  identity,
  memberships = {},
}: {
  identity?: { subject: string; email?: string; name?: string } | null;
  memberships?: Record<string, Role>;
}) {
  return {
    auth: {
      getUserIdentity: vi.fn(async () => identity ?? null),
    },
    db: {
      normalizeId: () => null,
      get: vi.fn(async () => null),
      insert,
      patch,
      delete: remove_,
      query: vi.fn(() => {
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

function handlerOf(fn: unknown) {
  return (fn as { _handler: (ctx: never, args: unknown) => Promise<unknown> })._handler;
}

const upsertHandler = handlerOf(upsert);
const removeHandler = handlerOf(remove);

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
  });

  it("rejects anyone below admin on the upsert, an editor included", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

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
});
