import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAll, getBySlug, getSubstanceList } from "../../server/articleSources";

type Role = "admin" | "editor" | "contributor" | "viewer";

const collect = vi.fn(async () => [] as unknown[]);
const first = vi.fn(async () => null);
const paginate = vi.fn(async () => ({ page: [], continueCursor: "", isDone: true }));

/** Same fake ctx shape as `lib/dataSubstanceIndexEditorReadAuth.test.ts`. */
function createCtx(memberships: Record<string, Role>) {
  return {
    auth: { getUserIdentity: vi.fn(async () => null) },
    db: {
      query: vi.fn((table: string) => {
        if (table === "articleSources") {
          return {
            collect,
            paginate,
            withIndex: () => ({ first }),
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

type Handler = (ctx: never, args: unknown) => Promise<unknown>;

// Postgres registered functions keep the original handler on `_handler`; there is
// no in-repo Postgres runtime harness, so the handler is exercised directly.
function handlerOf(registered: unknown): Handler {
  const withHandler = registered as { _handler: Handler };
  return withHandler._handler;
}

const handlers: Array<[string, Handler, Record<string, unknown>]> = [
  ["getBySlug", handlerOf(getBySlug), { slug: "lsd" }],
  ["getSubstanceList", handlerOf(getSubstanceList), {}],
  ["getAll", handlerOf(getAll), {}],
];

describe("articleSources query security", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = "secret";
    collect.mockClear();
    first.mockClear();
    paginate.mockClear();
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it.each(handlers)("%s refuses an unauthenticated caller before reading", async (_name, handler, args) => {
    await expect(handler(createCtx({}), args)).rejects.toThrow("Authentication required");
    expect(collect).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(paginate).not.toHaveBeenCalled();
  });

  it.each(handlers)("%s refuses a delegated actor below the editor floor", async (_name, handler, args) => {
    await expect(
      handler(createCtx({ "viewer@example.com": "viewer" }), {
        ...args,
        apiKey: "secret",
        actorEmail: "viewer@example.com",
      }),
    ).rejects.toThrow("Editor access required");
    expect(collect).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(paginate).not.toHaveBeenCalled();
  });

  it.each(handlers)("%s serves a delegated editor", async (_name, handler, args) => {
    await expect(
      handler(createCtx({ "editor@example.com": "editor" }), {
        ...args,
        apiKey: "secret",
        actorEmail: "editor@example.com",
      }),
    ).resolves.toBeDefined();
  });
});
