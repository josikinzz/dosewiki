import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    citationEvidence: {
      getQueueSummary: "citationEvidence.getQueueSummary",
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

describe("citation review queue route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.query.mockReset();
    mocks.getServerConvexWriteCapability.mockReset();
    mocks.query.mockResolvedValue([{ slug: "lsd", supportedCount: 2 }]);
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { query: mocks.query },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "review-token"),
      },
    });
  });

  it("returns the open queue summary by default so fully approved articles drain", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/citation-evidence/queue"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      queue: [{ slug: "lsd", supportedCount: 2 }],
    });
    expect(mocks.query).toHaveBeenCalledWith("citationEvidence.getQueueSummary", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
      status: "open",
    });
  });

  it("forwards an explicit status filter to the queue summary", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/citation-evidence/queue?status=rejected"),
    );

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith("citationEvidence.getQueueSummary", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
      status: "rejected",
    });
  });

  it("rejects an unknown status filter without querying", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/citation-evidence/queue?status=archived"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Unknown citation review queue filter: archived",
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
