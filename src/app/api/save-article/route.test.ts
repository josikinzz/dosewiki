import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

const nextCacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: nextCacheMocks.revalidatePath,
  revalidateTag: nextCacheMocks.revalidateTag,
}));

vi.mock("@server/data/publicData", () => ({
  PUBLIC_DATA_CACHE_TAGS: {
    all: "data-public",
  },
}));

vi.mock("@server/data/publicLibrary", () => ({
  invalidatePublicDerivedDataCache: vi.fn(),
}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    substanceIndex: {
      saveSubstances: "substanceIndex.saveSubstances",
      getById: "substanceIndex.getById",
      getBySlug: "substanceIndex.getBySlug",
    },
    indexLayouts: {
      save: "indexLayouts.save",
    },
    changelog: {
      addEntry: "changelog.addEntry",
    },
    saveArticleBatch: { save: "saveArticleBatch.save" },
  },
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
}));

function withBatch(client: { mutation: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> }) {
  const nested = client.mutation as (name: string, args: Record<string, unknown>) => Promise<unknown>;
  client.mutation = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== "saveArticleBatch.save") return nested(name, args);
    const articleResult = await nested("substanceIndex.saveSubstances", { apiKey: args.apiKey, actorEmail: args.actorEmail, articles: args.articles });
    return { articleResult, layoutResults: [], changelogSaved: false };
  });
  return client;
}

describe("save-article route", () => {
  beforeEach(() => {
    vi.resetModules();
    nextCacheMocks.revalidatePath.mockReset();
    nextCacheMocks.revalidateTag.mockReset();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin"));
    mocks.getServerDataWriteCapability.mockReset();
  });

  it("does not revalidate when an atomic save fails at a later layout", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "substanceIndex.saveSubstances") return {
          created: 0, updated: 1, errors: [], affectedPaths: ["/lsd"],
          outcomes: [{ target: "id:1", action: "updated", title: "LSD", requestedSlug: "lsd", fallbackSlug: "lsd", canonicalSlug: "lsd", previous: { id: 1, title: "LSD", slug: "lsd" }, next: { id: 1, title: "LSD", slug: "lsd" }, affectedPaths: ["/lsd"], publicRevision: "revision-2", publicationDependency: "content" }],
        };
        if (name === "indexLayouts.save") throw new Error("layout write failed");
        throw new Error(`Unexpected mutation ${name}`);
      }),
    };
    mocks.getServerDataWriteCapability.mockReturnValue({ ok: true, capability: { adminKey: "admin-key", client } });
    const { POST } = await import("./route");
    const response = await POST(new Request("https://dose.wiki/api/save-article", {
      method: "POST", headers: { Origin: "https://dose.wiki" },
      body: JSON.stringify({ articles: [{ id: 1, title: "LSD", slug: "lsd" }], indexLayouts: [{ type: "chemical", version: 2, categories: [], expected: null, expectedRevision: 0, operationId: "chemical-fixture-operation" }], changelog: { markdown: "Changed LSD", articles: [{ id: 1, title: "LSD", slug: "lsd" }] } }),
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "data_save_failed",
      phase: "article-mutation",
    });
    expect(nextCacheMocks.revalidatePath).not.toHaveBeenCalled();
    expect(client.mutation).toHaveBeenCalledTimes(1);
  });

  it("refuses an editor: the panel routes editors through /api/dev/proposals instead", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const client = { query: vi.fn(), mutation: vi.fn() };
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: { adminKey: "admin-key", client },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-article", { method: "POST", headers: { Origin: "https://dose.wiki" }, body: JSON.stringify({ articles: [{ id: 1, title: "LSD", slug: "lsd" }] }), }),
    );

    expect(response.status).toBe(403);
    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("delegates the authenticated editor email to every user-initiated Postgres write", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "substanceIndex.saveSubstances") return {
          created: 1, updated: 0, skipped: 0, errors: [], affectedPaths: ["/lsd"],
          outcomes: [{ target: "id:1", action: "created", title: "LSD", requestedSlug: "lsd", fallbackSlug: "lsd", canonicalSlug: "lsd", previous: null, next: { id: 1, title: "LSD", slug: "lsd" }, affectedPaths: ["/lsd"] }],
        };
        throw new Error(`Unexpected mutation ${name}`);
      }),
    };
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: { adminKey: "admin-key", client: withBatch(client), getAdminIntentToken: vi.fn(() => "article-token") },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-article", { method: "POST", headers: { Origin: "https://dose.wiki" }, body: JSON.stringify({ articles: [{ id: 1, title: "LSD", slug: "lsd" }] }), }),
    );

    expect(response.status).toBe(200);
    expect(client.mutation).toHaveBeenCalledWith("saveArticleBatch.save", expect.objectContaining({
      apiKey: "article-token",
      actorEmail: "editor@example.com",
    }));
  });
});
