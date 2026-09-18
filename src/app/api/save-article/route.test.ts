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

const publicLibraryMocks = vi.hoisted(() => ({
  invalidatePublicDerivedDataCache: vi.fn(),
}));

vi.mock("@server/data/publicLibrary", () => ({
  invalidatePublicDerivedDataCache: publicLibraryMocks.invalidatePublicDerivedDataCache,
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

describe("save-article route", () => {
  beforeEach(() => {
    vi.resetModules();
    nextCacheMocks.revalidatePath.mockReset();
    nextCacheMocks.revalidateTag.mockReset();
    publicLibraryMocks.invalidatePublicDerivedDataCache.mockReset();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin"));
    mocks.getServerDataWriteCapability.mockReset();
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

  it("uses substance ingestion outcomes for verification and revalidation", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "substanceIndex.saveSubstances") {
          return {
            created: 0,
            updated: 1,
            skipped: 0,
            errors: [],
            affectedPaths: ["/lsd", "/old-lsd", "/substances"],
            outcomes: [
              {
                target: "id:1",
                action: "updated",
                title: "LSD",
                requestedSlug: "lsd",
                fallbackSlug: "lsd",
                canonicalSlug: "lsd",
                previous: { id: 1, title: "Old LSD", slug: "old-lsd" },
                next: { id: 1, title: "LSD", slug: "lsd" },
                affectedPaths: ["/lsd", "/old-lsd", "/substances"],
              },
            ],
          };
        }

        throw new Error(`Unexpected mutation ${name}`);
      }),
    };
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-article", { method: "POST", headers: { Origin: "https://dose.wiki" }, body: JSON.stringify({
        articles: [{ id: 1, title: "LSD", slug: "lsd" }],
      }), }),
    );

    expect(response.status).toBe(200);
    expect(client.query).not.toHaveBeenCalled();
    expect(client.mutation).toHaveBeenCalledWith("substanceIndex.saveSubstances", {
      apiKey: "admin-key",
      actorEmail: "editor@example.com",
      articles: [{ id: 1, title: "LSD", slug: "lsd" }],
    });
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith("/lsd");
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith("/old-lsd");
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith("/substances");
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      savedItems: ["1 article(s)"],
      verification: [
        {
          target: "id:1",
          found: true,
          previousSlug: "old-lsd",
          requestedSlug: "lsd",
          storedSlug: "lsd",
          storedTitle: "LSD",
          titleMatches: true,
          slugMatches: true,
        },
      ],
      revalidatedPaths: ["/lsd", "/old-lsd", "/substances"],
    });
  });

  it("strips fields that Postgres article mutations do not accept before forwarding article payloads", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "substanceIndex.saveSubstances") {
          return {
            created: 0,
            updated: 1,
            skipped: 0,
            errors: [],
            affectedPaths: ["/dextromethorphan", "/substances"],
            outcomes: [
              {
                target: "id:282",
                action: "updated",
                title: "Dextromethorphan",
                requestedSlug: "dextromethorphan",
                fallbackSlug: "dextromethorphan",
                canonicalSlug: "dextromethorphan",
                previous: { id: 282, title: "Dextromethorphan", slug: "dextromethorphan" },
                next: { id: 282, title: "Dextromethorphan", slug: "dextromethorphan" },
                affectedPaths: ["/dextromethorphan", "/substances"],
              },
            ],
          };
        }

        throw new Error(`Unexpected mutation ${name}`);
      }),
    };
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
        getAdminIntentToken: vi.fn(() => "article-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-article", { method: "POST", headers: { Origin: "https://dose.wiki" }, body: JSON.stringify({
        articles: [
          {
            _creationTime: 1768751404790.3594,
            _id: "kd749agfhj6sa0pmw8eytfb1g57zfezs",
            uiOnlyDraftState: "dirty",
            id: 282,
            title: "Dextromethorphan",
            slug: "dextromethorphan",
          },
        ],
      }), }),
    );

    expect(response.status).toBe(200);
    expect(client.mutation).toHaveBeenCalledWith("substanceIndex.saveSubstances", {
      apiKey: "article-token",
      actorEmail: "editor@example.com",
      articles: [
        {
          id: 282,
          title: "Dextromethorphan",
          slug: "dextromethorphan",
        },
      ],
    });
  });

  it("delegates the authenticated editor email to every user-initiated Postgres write", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "substanceIndex.saveSubstances") {
          return {
            created: 1,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedPaths: ["/lsd", "/substances"],
            outcomes: [
              {
                target: "id:1",
                action: "created",
                title: "LSD",
                requestedSlug: "lsd",
                fallbackSlug: "lsd",
                canonicalSlug: "lsd",
                previous: null,
                next: { id: 1, title: "LSD", slug: "lsd" },
                affectedPaths: ["/lsd", "/substances"],
              },
            ],
          };
        }

        if (name === "changelog.addEntry") {
          return { created: true, id: "entry-id" };
        }

        throw new Error(`Unexpected mutation ${name}`);
      }),
    };
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
        getAdminIntentToken: vi.fn(() => "article-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-article", { method: "POST", headers: { Origin: "https://dose.wiki" }, body: JSON.stringify({
        articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        changelog: {
          markdown: "Changed LSD.",
          articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        },
      }), }),
    );

    expect(response.status).toBe(200);
    expect(client.mutation).not.toHaveBeenCalledWith("siteConfig.saveAbout", expect.anything());
    expect(client.mutation).toHaveBeenCalledWith("substanceIndex.saveSubstances", expect.objectContaining({
      apiKey: "article-token",
      actorEmail: "editor@example.com",
    }));
    expect(client.mutation).toHaveBeenCalledWith("changelog.addEntry", expect.objectContaining({
      apiKey: "article-token",
      actorEmail: "editor@example.com",
    }));
  });

  it("persists every changed index layout dataset through the authenticated Postgres route", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "indexLayouts.save") {
          return { updated: true, id: "layout-id", revision: 1, replayed: false, unchanged: false };
        }

        throw new Error(`Unexpected mutation ${name}`);
      }),
    };
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
        getAdminIntentToken: vi.fn(() => "article-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-article", { method: "POST", headers: { Origin: "https://dose.wiki" }, body: JSON.stringify({
        indexLayouts: [
          { type: "chemical", version: 2, categories: [], expected: null, expectedRevision: 0, operationId: "chemical-fixture-operation" },
          { type: "mechanism", version: 3, categories: [], expected: null, expectedRevision: 0, operationId: "mechanism-fixture-operation" },
        ],
      }), }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      savedItems: ["2 index layout publication receipt(s) confirmed"],
      revalidatedPaths: ["/chemical", "/mechanism", "/substances"],
    });
  });


  it("returns request diagnostics when the Postgres article mutation rejects editor access", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "substanceIndex.saveSubstances") {
          throw new Error("Editor access required");
        }

        throw new Error(`Unexpected mutation ${name}`);
      }),
    };
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
        getAdminIntentToken: vi.fn(() => "article-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-article", { method: "POST", headers: { Origin: "https://dose.wiki" }, body: JSON.stringify({
        articles: [{ id: 1, title: "LSD", slug: "lsd" }],
      }), }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Editor access required for Postgres writes.",
      code: "data_editor_access_required",
      phase: "article-mutation",
      details: [
        "The signed-in account authenticated with Next.js, but Postgres does not have an admin/editor membership for that email.",
      ],
    });
  });
});
