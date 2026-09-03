import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    citationEvidence: {
      setManyStatus: "citationEvidence.setManyStatus",
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
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

describe("citation evidence status route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.mutation.mockReset();
    mocks.getServerConvexWriteCapability.mockReset();
    mocks.mutation.mockResolvedValue({ updated: 1 });
    authMocks.requireRoleSession.mockReset().mockImplementation(
      roleSessionFor("admin", { email: "editor@example.com", name: "Editor" }),
    );
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { mutation: mocks.mutation },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "review-token"),
      },
    });
  });

  it("writes reviewer decisions through the protected route and derives actor identity server-side", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/citation-evidence/status", {
        method: "POST",
        body: JSON.stringify({
          slug: "lsd",
          claimKey: "summary:0",
          status: "approved",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      updated: 1,
      updatedBy: "editor@example.com",
    });
    expect(mocks.mutation).toHaveBeenCalledWith("citationEvidence.setManyStatus", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
      slug: "lsd",
      claimKeys: ["summary:0"],
      status: "approved",
    });
  });

  it("refuses an editor session with 403 before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/citation-evidence/status", {
        method: "POST",
        body: JSON.stringify({ slug: "lsd", claimKey: "summary:0", status: "approved" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects unsupported review statuses", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/citation-evidence/status", {
        method: "POST",
        body: JSON.stringify({
          slug: "lsd",
          claimKey: "summary:0",
          status: "supported",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Review status must be approved or rejected.",
    });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
