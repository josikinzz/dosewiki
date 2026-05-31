import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const nextCacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: nextCacheMocks.revalidatePath,
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
    siteConfig: {
      saveAbout: "siteConfig.saveAbout",
    },
    indexLayouts: {
      save: "indexLayouts.save",
    },
    changelog: {
      addEntry: "changelog.addEntry",
    },
  },
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireEditorSession: vi.fn(async () => ({
    ok: true,
    session: { user: { email: "editor@example.com", name: "Editor" } },
    role: "editor",
  })),
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
    publicLibraryMocks.invalidatePublicDerivedDataCache.mockReset();
    mocks.getServerConvexWriteCapability.mockReset();
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

  it("delegates the authenticated editor email to every user-initiated Convex write", async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async (name: string) => {
        if (name === "siteConfig.saveAbout") {
          return { updated: true, id: "about-id" };
        }

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
          about: { aboutMarkdown: "About", founderProfileKeys: ["editor"] },
          articles: [{ id: 1, title: "LSD", slug: "lsd" }],
          changelog: {
            markdown: "Changed LSD.",
            articles: [{ id: 1, title: "LSD", slug: "lsd" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(client.mutation).toHaveBeenCalledWith("siteConfig.saveAbout", expect.objectContaining({
      apiKey: "article-token",
      actorEmail: "editor@example.com",
    }));
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
});
