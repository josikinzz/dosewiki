import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));
vi.mock("@server/postgres/runtime/api", () => ({
  api: { glossaryFeedback: { pendingCount: "glossaryFeedback.pendingCount" } },
}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  requireRoleSession: vi.fn(),
}));
vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: mocks.requireRoleSession,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));
vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapabilityOrThrow: () => ({
    client: { query: mocks.query },
    adminKey: "admin-key",
    getAdminIntentToken: () => "review-token",
  }),
}));

describe("glossary feedback pending-count route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.query.mockReset();
    mocks.query.mockResolvedValue(4);
    mocks.requireRoleSession.mockImplementation(roleSessionFor("translator"));
  });

  it("answers the pending total for the signed-in reviewer", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/glossary-feedback/pending-count"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, total: 4 });
    expect(mocks.query).toHaveBeenCalledWith("glossaryFeedback.pendingCount", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
    });
  });

  it("refuses a member below the translator floor without querying", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/glossary-feedback/pending-count"));

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
