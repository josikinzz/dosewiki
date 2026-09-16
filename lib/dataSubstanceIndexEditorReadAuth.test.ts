import { afterEach, describe, expect, it, vi } from "vitest";
import { getEditorBySlug, getEditorLibraryPage, getTagRegistryPage } from "../server/substanceIndex";

type Role = "admin" | "editor" | "viewer";

const paginate = vi.fn(async () => ({
  page: [],
  continueCursor: "",
  isDone: true,
}));

/**
 * Mirrors the ctx shape in `dataAuthzWriteIntents.test.ts`, plus the
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
      getEditorLibraryPage: paginate,
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

// Postgres registered functions keep the original handler on `_handler`; there is
// no in-repo Postgres runtime harness, so the handler is exercised directly.
const handler = (getTagRegistryPage as unknown as {
  _handler: (ctx: never, args: unknown) => Promise<unknown>;
})._handler;

const paginationOpts = { numItems: 10, cursor: null };

describe("substanceIndex.getTagRegistryPage authorization", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
    delete process.env.DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE;
    paginate.mockClear();
  });

  it("refuses a non-editor membership before reading any editor document", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    await expect(
      handler(
        createCtx({ identity: null, memberships: { "viewer@example.com": "viewer" } }),
        { paginationOpts, apiKey: "secret", actorEmail: "viewer@example.com" },
      ),
    ).rejects.toThrow("Editor access required");

    expect(paginate).not.toHaveBeenCalled();
  });

  it("serves the editor projection to a delegated editor actor", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    await expect(
      handler(
        createCtx({ identity: null, memberships: { "editor@example.com": "editor" } }),
        { paginationOpts, apiKey: "secret", actorEmail: "editor@example.com" },
      ),
    ).resolves.toMatchObject({ page: [], isDone: true });

  });
});

const libraryPageHandler = (getEditorLibraryPage as unknown as {
  _handler: (ctx: never, args: unknown) => Promise<unknown>;
})._handler;

const bySlugHandler = (getEditorBySlug as unknown as {
  _handler: (ctx: never, args: unknown) => Promise<unknown>;
})._handler;

describe("substanceIndex.getEditorLibraryPage authorization", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
    paginate.mockClear();
  });

  it("is guarded exactly like the whole-article drain", async () => {
    // The slim list still carries `editorial_review` (review status, notes,
    // and flags), so trimming the projection must not have relaxed the gate.
    process.env.DATA_ADMIN_KEY = "secret";

    await expect(
      libraryPageHandler(
        createCtx({ identity: null, memberships: { "viewer@example.com": "viewer" } }),
        { paginationOpts, apiKey: "secret", actorEmail: "viewer@example.com" },
      ),
    ).rejects.toThrow("Editor access required");

    expect(paginate).not.toHaveBeenCalled();
  });

  it("serves the list projection to a delegated editor actor", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    await expect(
      libraryPageHandler(
        createCtx({ identity: null, memberships: { "editor@example.com": "editor" } }),
        { paginationOpts, apiKey: "secret", actorEmail: "editor@example.com" },
      ),
    ).resolves.toMatchObject({ page: [], isDone: true });

  });
});

describe("substanceIndex.getEditorBySlug authorization", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it("refuses a non-editor membership before reading the article", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    await expect(
      bySlugHandler(
        createCtx({ identity: null, memberships: { "viewer@example.com": "viewer" } }),
        { slug: "lsd", apiKey: "secret", actorEmail: "viewer@example.com" },
      ),
    ).rejects.toThrow("Editor access required");
  });
});
