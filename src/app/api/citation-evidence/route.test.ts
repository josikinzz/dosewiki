import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    citationEvidence: {
      getBySlug: "citationEvidence.getBySlug",
    },
  },
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: vi.fn(roleSessionFor("editor")),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
}));

describe("citation evidence detail route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.query.mockReset();
    mocks.getServerDataWriteCapability.mockReset();
    mocks.query.mockResolvedValue([{ claimKey: "summary:0" }]);
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { query: mocks.query },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "review-token"),
      },
    });
  });

  it("loads protected evidence rows for a slug", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/citation-evidence?slug=lsd"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      slug: "lsd",
      rows: [{ claimKey: "summary:0" }],
    });
    expect(mocks.query).toHaveBeenCalledWith("citationEvidence.getBySlug", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
      slug: "lsd",
    });
  });

  it("rejects requests without a slug", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/citation-evidence"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Slug is required." });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
