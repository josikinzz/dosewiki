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
        headers: { Origin: "https://dose.wiki" },
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
      statusReason: undefined,
    });
  });

  it("refuses an editor session with 403 before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/citation-evidence/status", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ slug: "lsd", claimKey: "summary:0", status: "approved" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("forwards a trimmed rejection reason and lets undo restore any evidence status", async () => {
    const { POST } = await import("./route");

    const rejected = await POST(
      new Request("https://dose.wiki/api/citation-evidence/status", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({
          slug: "lsd",
          claimKey: "summary:0",
          status: "rejected",
          statusReason: "  Wrong source  ",
        }),
      }),
    );
    expect(rejected.status).toBe(200);
    expect(mocks.mutation).toHaveBeenLastCalledWith("citationEvidence.setManyStatus", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
      slug: "lsd",
      claimKeys: ["summary:0"],
      status: "rejected",
      statusReason: "Wrong source",
    });

    const restored = await POST(
      new Request("https://dose.wiki/api/citation-evidence/status", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ slug: "lsd", claimKeys: ["summary:0"], status: "supported" }),
      }),
    );
    expect(restored.status).toBe(200);
    expect(mocks.mutation).toHaveBeenLastCalledWith("citationEvidence.setManyStatus", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
      slug: "lsd",
      claimKeys: ["summary:0"],
      status: "supported",
      statusReason: undefined,
    });
  });

  it("rejects unknown statuses and oversized reasons without touching Convex", async () => {
    const { POST } = await import("./route");

    const unknown = await POST(
      new Request("https://dose.wiki/api/citation-evidence/status", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ slug: "lsd", claimKey: "summary:0", status: "archived" }),
      }),
    );
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({
      error: "Review status must be an evidence status.",
    });

    const oversized = await POST(
      new Request("https://dose.wiki/api/citation-evidence/status", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({
          slug: "lsd",
          claimKey: "summary:0",
          status: "rejected",
          statusReason: "x".repeat(501),
        }),
      }),
    );
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toEqual({
      error: "Status reason must be 500 characters or fewer.",
    });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
