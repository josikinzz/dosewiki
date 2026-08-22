import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    replications: {
      getStudioRows: "replications.getStudioRows",
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
  probe: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
  probeServerConvexAdminCredential: mocks.probe,
}));

/**
 * `./route` is imported per test rather than statically: `vi.resetModules()` plus
 * per-test capability mocks mean the module must be evaluated *after* its mocks
 * are in place, which a static import cannot do. Same pattern as the
 * citation-evidence route tests.
 */
describe("replication corpus route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.query.mockReset();
    mocks.getServerConvexWriteCapability.mockReset();
    mocks.probe.mockReset();
    mocks.probe.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue({ rows: [], effects: [] });
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { query: mocks.query },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "maintenance-token"),
      },
    });
  });

  const request = () => new Request("https://dose.wiki/api/dev/replications");

  it("serves the corpus for an editor", async () => {
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, rows: [], effects: [] });
  });

  /**
   * The failure that made the studio unusable in local dev: a rotated admin key
   * reached the route as `[Request ID: …] Server Error` with no reason attached,
   * and the studio reported the corpus as unavailable. Convex tells the caller
   * nothing, so the route re-tests the token it sent and reports the credential.
   */
  it("names the failing credential when the deployment refuses the token too", async () => {
    const opaque = new Error("[Request ID: 12995810d918ffa3] Server Error");
    mocks.query.mockRejectedValue(opaque);
    mocks.probe.mockRejectedValue(opaque);
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("replicationMaintenance");
    expect(payload.error).toContain("convex:doctor");
    // The token the query used is the one re-tested — not the legacy key.
    expect(mocks.probe).toHaveBeenCalledWith(expect.any(String), "maintenance-token");
  });

  it("keeps a genuine failure's own error when the credential is accepted", async () => {
    // Same opaque wire shape as above; only the probe's verdict differs.
    mocks.query.mockRejectedValue(new Error("[Request ID: 60e9e02e065c4fa9] Server Error"));
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).not.toContain("convex:doctor");
  });
});
