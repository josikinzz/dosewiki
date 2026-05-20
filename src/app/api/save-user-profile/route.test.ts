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
    contributorProfiles: {
      generateAvatarUploadUrl: "contributorProfiles.generateAvatarUploadUrl",
      saveProfile: "contributorProfiles.saveProfile",
    },
    authorAttribution: {
      saveContributorProfile: "authorAttribution.saveContributorProfile",
    },
  },
}));

vi.mock("@/lib/auth/requireAuthenticatedSession", () => ({
  requireAuthenticatedSession: vi.fn(async () => ({
    ok: true,
    session: { user: { email: "editor@example.com", name: "Editor" } },
    role: "editor",
  })),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

describe("save user profile route operation envelope", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    mocks.mutation.mockReset();
    nextCacheMocks.revalidatePath.mockReset();
    mocks.getServerConvexWriteCapability.mockReset();
    mocks.mutation.mockResolvedValue({
      profile: {
        key: "EDITOR",
        displayName: "Editor",
      },
      revalidate: {
        contributorKeys: ["EDITOR"],
        reportSlugs: [],
      },
    });
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { mutation: mocks.mutation },
        adminKey: "admin-key",
      },
    });
  });

  it("passes a requested profile key to Convex without canonicalizing it", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-user-profile", {
        method: "POST",
        body: JSON.stringify({
          profile: {
            key: " editor-alias ",
            displayName: "Editor",
            bio: "",
            links: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith(
      "authorAttribution.saveContributorProfile",
      expect.objectContaining({
        profile: expect.objectContaining({
          key: " editor-alias ",
        }),
      }),
    );
  });

  it("saves a profile with the existing success response shape", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-user-profile", {
        method: "POST",
        body: JSON.stringify({
          profile: {
            displayName: "Editor",
            bio: "Bio",
            links: [{ label: "Site", url: "https://example.com" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      profile: {
        key: "EDITOR",
        displayName: "Editor",
      },
    });
    expect(mocks.mutation).toHaveBeenCalledWith("authorAttribution.saveContributorProfile", {
      apiKey: "admin-key",
      actorEmail: "editor@example.com",
      profile: {
        key: "",
        displayName: "Editor",
        bio: "Bio",
        links: [{ label: "Site", url: "https://example.com" }],
        avatarStorageId: undefined,
        avatarUrl: undefined,
      },
    });
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith("/contributors/editor");
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith("/about");
  });

  it("revalidates contributor aliases returned by the attribution operation", async () => {
    mocks.mutation.mockResolvedValueOnce({
      profile: {
        key: "EDITOR",
        displayName: "New Name",
      },
      revalidate: {
        contributorKeys: ["EDITOR", "OLDNAME"],
        reportSlugs: [],
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-user-profile", {
        method: "POST",
        body: JSON.stringify({
          profile: {
            displayName: "New Name",
            bio: "",
            links: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith("/contributors/editor");
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith("/contributors/oldname");
  });

  it("preserves the missing profile validation response", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-user-profile", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Profile payload is required." });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects unsupported avatar upload MIME types before writing", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-user-profile", {
        method: "POST",
        body: JSON.stringify({
          profile: {
            displayName: "Editor",
            bio: "",
            links: [],
          },
          avatarUpload: {
            filename: "avatar.gif",
            mimeType: "image/gif",
            base64: "YWJj",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Avatar must be a PNG, JPG, or WebP image." });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("uploads valid avatar payloads and passes the storage id to Convex", async () => {
    mocks.mutation
      .mockResolvedValueOnce("https://uploads.example.com/avatar")
      .mockResolvedValueOnce({
        profile: {
          key: "EDITOR",
          displayName: "Editor",
        },
        revalidate: {
          contributorKeys: ["EDITOR"],
          reportSlugs: [],
        },
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ storageId: "storage_123" }),
      })),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-user-profile", {
        method: "POST",
        body: JSON.stringify({
          profile: {
            displayName: "Editor",
            bio: "",
            links: [],
            avatarUrl: null,
          },
          avatarUpload: {
            filename: "avatar.png",
            mimeType: "image/png",
            base64: "YWJj",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith("https://uploads.example.com/avatar", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
      },
      body: Buffer.from("YWJj", "base64"),
    });
    expect(mocks.mutation).toHaveBeenLastCalledWith(
      "authorAttribution.saveContributorProfile",
      expect.objectContaining({
        profile: expect.objectContaining({
          avatarStorageId: "storage_123",
          avatarUrl: undefined,
        }),
      }),
    );
  });

  it("preserves the profile-specific missing admin key message", async () => {
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: false,
      failure: {
        type: "configuration",
        missing: ["adminKey"],
        message: "Convex admin key is not configured on the server.",
        health: {
          adminKeyConfigured: false,
          convexUrlConfigured: true,
          canSaveToConvex: false,
          issues: ["Missing CONVEX_ADMIN_KEY on the server."],
        },
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-user-profile", {
        method: "POST",
        body: JSON.stringify({ profile: { displayName: "Editor" } }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Convex admin key is not configured on the server. Set CONVEX_ADMIN_KEY in the deployment environment.",
    });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
