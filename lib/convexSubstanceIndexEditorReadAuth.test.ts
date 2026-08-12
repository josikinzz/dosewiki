import { afterEach, describe, expect, it, vi } from "vitest";
import { getEditorPage } from "../convex/substanceIndex";

type Role = "admin" | "editor" | "viewer";

const paginate = vi.fn(async () => ({
  page: [],
  continueCursor: "",
  isDone: true,
}));

/**
 * Mirrors the ctx shape in `convexAuthzWriteIntents.test.ts`, plus the
 * `substanceIndex` table read the editor projection performs once authorized.
 */
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
      query: vi.fn((table: string) => {
        if (table === "substanceIndex") {
          return { paginate };
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
const handler = (getEditorPage as unknown as {
  _handler: (ctx: never, args: unknown) => Promise<unknown>;
})._handler;

const paginationOpts = { numItems: 10, cursor: null };

describe("substanceIndex.getEditorPage authorization", () => {
  afterEach(() => {
    delete process.env.CONVEX_ADMIN_KEY;
    delete process.env.CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE;
    paginate.mockClear();
  });

  it("rejects an unauthenticated caller before reading any editor document", async () => {
    await expect(
      handler(createCtx({ identity: null }), { paginationOpts }),
    ).rejects.toThrow("Authentication required");

    expect(paginate).not.toHaveBeenCalled();
  });

  it("rejects an invalid API key and a non-editor membership", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    await expect(
      handler(createCtx({ identity: null }), { paginationOpts, apiKey: "wrong" }),
    ).rejects.toThrow("Authentication failed: Invalid API key");

    await expect(
      handler(
        createCtx({ identity: null, memberships: { "viewer@example.com": "viewer" } }),
        { paginationOpts, apiKey: "secret", actorEmail: "viewer@example.com" },
      ),
    ).rejects.toThrow("Editor access required");

    expect(paginate).not.toHaveBeenCalled();
  });

  it("serves the editor projection to a delegated editor actor", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    await expect(
      handler(
        createCtx({ identity: null, memberships: { "editor@example.com": "editor" } }),
        { paginationOpts, apiKey: "secret", actorEmail: "editor@example.com" },
      ),
    ).resolves.toMatchObject({ page: [], isDone: true });

    expect(paginate).toHaveBeenCalledTimes(1);
  });
});
