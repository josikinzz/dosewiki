import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as NextCache from "next/cache";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    siteConfig: {
      saveAbout: "siteConfig.saveAbout",
    },
  },
}));

const nextCacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof NextCache>()),
  revalidatePath: nextCacheMocks.revalidatePath,
  revalidateTag: nextCacheMocks.revalidateTag,
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
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

import { POST } from "./route";

const SAVE = {
  aboutMarkdown: "# Mission\n\nWe index {{compoundCount}} compounds.",
  aboutSubtitle: "An open substance library.",
  founderProfileKeys: ["josie", " sam ", "JOSIE"],
};

function saveRequest(body: Record<string, unknown>) {
  return new Request("https://dose.wiki/api/dev/about", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("about route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { mutation: mocks.mutation }, adminKey: "admin-key" },
    });
    mocks.mutation.mockResolvedValue({ updated: true, id: "about-id" });
  });

  it("saves the whole document through siteConfig.saveAbout and expires the About cache", async () => {
    const response = await POST(saveRequest(SAVE));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      about: {
        aboutMarkdown: SAVE.aboutMarkdown,
        aboutSubtitle: SAVE.aboutSubtitle,
        founderProfileKeys: ["JOSIE", "SAM"],
      },
    });
    expect(mocks.mutation).toHaveBeenCalledWith("siteConfig.saveAbout", {
      apiKey: "admin-key",
      actorEmail: "editor@example.com",
      aboutMarkdown: SAVE.aboutMarkdown,
      aboutSubtitle: SAVE.aboutSubtitle,
      founderProfileKeys: ["JOSIE", "SAM"],
      updatedBy: "editor@example.com",
    });
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith("/about");
    expect(nextCacheMocks.revalidateTag).toHaveBeenCalledWith("convex-public:about", { expire: 0 });
  });

  it("rejects a document missing its page copy before reaching Convex", async () => {
    const response = await POST(saveRequest({ ...SAVE, aboutMarkdown: undefined }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "The page copy must be a string." });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects founder keys that are not all strings", async () => {
    const response = await POST(saveRequest({ ...SAVE, founderProfileKeys: ["josie", 42] }));

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects founder keys outside the contributor key grammar", async () => {
    for (const key of ["jo sie", "josie!", "jösie", "a".repeat(201)]) {
      const response = await POST(saveRequest({ ...SAVE, founderProfileKeys: ["josie", key] }));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "Each founder key must be a contributor profile key: letters, digits, and hyphens only.",
      });
    }
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("accepts hyphenated and numeric founder keys", async () => {
    const response = await POST(saveRequest({ ...SAVE, founderProfileKeys: ["kay-two", "rho2"] }));

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith(
      "siteConfig.saveAbout",
      expect.objectContaining({ founderProfileKeys: ["KAY-TWO", "RHO2"] }),
    );
  });
});
