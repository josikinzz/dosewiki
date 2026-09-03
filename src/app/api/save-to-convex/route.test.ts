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

vi.mock("@server/convex/publicData", () => ({
  PUBLIC_CONVEX_CACHE_TAGS: {
    all: "convex-public",
  },
}));

const publicLibraryMocks = vi.hoisted(() => ({
  invalidatePublicDerivedDataCache: vi.fn(),
}));

vi.mock("@server/convex/publicLibrary", () => ({
  invalidatePublicDerivedDataCache: publicLibraryMocks.invalidatePublicDerivedDataCache,
}));

vi.mock("../../../../convex/_generated/api", () => ({
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
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

describe("save-to-convex route", () => {
  beforeEach(() => {
    vi.resetModules();
    nextCacheMocks.revalidatePath.mockReset();
    nextCacheMocks.revalidateTag.mockReset();
    publicLibraryMocks.invalidatePublicDerivedDataCache.mockReset();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin"));
    mocks.getServerConvexWriteCapability.mockReset();
  });

  it("refuses an editor: the panel routes editors through /api/dev/proposals instead", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const client = { query: vi.fn(), mutation: vi.fn() };
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { adminKey: "admin-key", client },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-to-convex", {
        method: "POST",
        body: JSON.stringify({ articles: [{ id: 1, title: "LSD", slug: "lsd" }] }),
      }),
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
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-to-convex", {
        method: "POST",
        body: JSON.stringify({
          articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        }),
      }),
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
    expect(publicLibraryMocks.invalidatePublicDerivedDataCache).toHaveBeenCalledWith({
      source: "save-to-convex",
    });
    expect(nextCacheMocks.revalidateTag).toHaveBeenCalledWith("convex-public", {
      expire: 0,
    });
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

  it("strips fields that Convex article mutations do not accept before forwarding article payloads", async () => {
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
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
        getAdminIntentToken: vi.fn(() => "article-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-to-convex", {
        method: "POST",
        body: JSON.stringify({
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
        }),
      }),
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

  it("delegates the authenticated editor email to every user-initiated Convex write", async () => {
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
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
        getAdminIntentToken: vi.fn(() => "article-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-to-convex", {
        method: "POST",
        body: JSON.stringify({
          articles: [{ id: 1, title: "LSD", slug: "lsd" }],
          changelog: {
            markdown: "Changed LSD.",
            articles: [{ id: 1, title: "LSD", slug: "lsd" }],
          },
        }),
      }),
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
    expect(publicLibraryMocks.invalidatePublicDerivedDataCache).toHaveBeenCalledWith({
      source: "save-to-convex",
    });
  });

  it("persists every changed index layout dataset through the authenticated Convex route", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "indexLayouts.save") {
          return { updated: true, id: "layout-id" };
        }

        throw new Error(`Unexpected mutation ${name}`);
      }),
    };
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
        getAdminIntentToken: vi.fn(() => "article-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-to-convex", {
        method: "POST",
        body: JSON.stringify({
          indexLayouts: [
            { type: "chemical", version: 2, categories: [] },
            { type: "mechanism", version: 3, categories: [] },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(client.mutation).toHaveBeenNthCalledWith(1, "indexLayouts.save", {
      apiKey: "article-token",
      actorEmail: "editor@example.com",
      type: "chemical",
      version: 2,
      categories: [],
    });
    expect(client.mutation).toHaveBeenNthCalledWith(2, "indexLayouts.save", {
      apiKey: "article-token",
      actorEmail: "editor@example.com",
      type: "mechanism",
      version: 3,
      categories: [],
    });
    expect(publicLibraryMocks.invalidatePublicDerivedDataCache).toHaveBeenCalledWith({
      source: "save-to-convex",
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      savedItems: ["2 index layout(s)"],
      revalidatedPaths: ["/chemical", "/mechanism", "/substances"],
    });
  });

  it("sends psychoactive layouts to indexLayouts.save only; Convex mirrors them into categoryLayout", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "indexLayouts.save") {
          return { updated: true, id: "layout-id" };
        }

        throw new Error(`Unexpected mutation ${name}`);
      }),
    };
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
        getAdminIntentToken: vi.fn(() => "article-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-to-convex", {
        method: "POST",
        body: JSON.stringify({
          indexLayouts: [
            {
              type: "psychoactive",
              version: 4,
              categories: [
                {
                  key: "psychedelics",
                  label: "Psychedelics",
                  iconKey: "sparkle",
                  notes: "editor-only note",
                  columns: { "3": 1 },
                  drugs: ["lsd"],
                  sections: [
                    {
                      key: "lysergamides",
                      label: "Lysergamides",
                      notes: "section note",
                      link: { type: "chemicalClass", value: "Lysergamide" },
                      drugs: ["ald-52"],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(client.mutation).toHaveBeenCalledTimes(1);
    expect(client.mutation).toHaveBeenCalledWith("indexLayouts.save", expect.objectContaining({
      apiKey: "article-token",
      actorEmail: "editor@example.com",
      type: "psychoactive",
      version: 4,
    }));
    expect(client.mutation).not.toHaveBeenCalledWith("categoryLayout.save", expect.anything());
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      savedItems: ["1 index layout(s)"],
      revalidatedPaths: ["/substances"],
    });
  });

  it("returns request diagnostics when the Convex article mutation rejects editor access", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "substanceIndex.saveSubstances") {
          throw new Error("Editor access required");
        }

        throw new Error(`Unexpected mutation ${name}`);
      }),
    };
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
        getAdminIntentToken: vi.fn(() => "article-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-to-convex", {
        method: "POST",
        body: JSON.stringify({
          articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Editor access required for Convex writes.",
      code: "convex_editor_access_required",
      phase: "article-mutation",
      details: [
        "The signed-in account authenticated with Next.js, but Convex does not have an admin/editor membership for that email.",
      ],
    });
  });
});
