import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    moleculeOverrides: {
      getBySlug: "moleculeOverrides.getBySlug",
      save: "moleculeOverrides.save",
      remove: "moleculeOverrides.remove",
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
  query: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

describe("molecule override route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.query.mockReset();
    mocks.getServerConvexWriteCapability.mockReset();
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { query: mocks.query }, adminKey: "admin-key" },
    });
  });

  it("loads a selected substance depiction through the authenticated editor deployment", async () => {
    mocks.query.mockResolvedValue({ slug: "2c-b", molblock: "mol", svg: "<svg />" });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/dev/molecule-override?slug=2c-b"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      override: { slug: "2c-b", molblock: "mol", svg: "<svg />" },
    });
    expect(mocks.query).toHaveBeenCalledWith("moleculeOverrides.getBySlug", { slug: "2c-b" });
  });
});
