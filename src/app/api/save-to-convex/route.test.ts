import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const nextCacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: nextCacheMocks.revalidatePath,
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
});

