import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
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
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
}));

describe("citation evidence status route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.mutation.mockReset();
    mocks.getServerDataWriteCapability.mockReset();
    mocks.mutation.mockResolvedValue({ updated: 1 });
    authMocks.requireRoleSession.mockReset().mockImplementation(
      roleSessionFor("admin", { email: "editor@example.com", name: "Editor" }),
    );
    mocks.getServerDataWriteCapability.mockReturnValue({
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

  it("refuses an editor session with 403 before touching Postgres", async () => {
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

});
