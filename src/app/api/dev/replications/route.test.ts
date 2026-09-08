import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    replications: {
      getStudioRows: "replications.getStudioRows",
      insertMediaAsset: "replications.insertMediaAsset",
    },
  },
}));

const publishMocks = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
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
beforeEach(() => {
  vi.resetModules();
  authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
  publishMocks.publishPublicCache.mockClear();
  mocks.query.mockReset();
  mocks.mutation.mockReset();
  mocks.getServerConvexWriteCapability.mockReset();
  mocks.probe.mockReset();
  mocks.probe.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue({ rows: [], effects: [] });
  mocks.mutation.mockResolvedValue({ slug: "new-asset", id: "asset-id" });
  mocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: mocks.query, mutation: mocks.mutation },
      adminKey: "admin-key",
      getAdminIntentToken: vi.fn(() => "maintenance-token"),
    },
  });
});

describe("replication corpus route", () => {
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

describe("replication create route", () => {
  const createRequest = () =>
    new Request("https://dose.wiki/api/dev/replications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
      body: JSON.stringify({
        slug: "new-asset",
        title: "New asset",
        artist: "Archive Artist",
        type: "image",
        format: "webp",
        storageId: "storage-id",
      }),
    });

  it("refuses an editor creating an asset with 403 before touching Convex", async () => {
    const { POST } = await import("./route");

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("inserts the asset for an admin and publishes the replication collections", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    const { POST } = await import("./route");

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith(
      "replications.insertMediaAsset",
      expect.objectContaining({ slug: "new-asset", actorEmail: "admin@example.com" }),
    );
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "replication-collections" }],
      source: "manual",
    });
  });

  it("publishes the owning effect alongside the collections when the asset has one", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/dev/replications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
        body: JSON.stringify({
          slug: "new-asset",
          title: "New asset",
          artist: "Archive Artist",
          type: "image",
          format: "webp",
          storageId: "storage-id",
          effectSlug: "tracers",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "replication-collections" }, { kind: "effect", slug: "tracers" }],
      source: "manual",
    });
  });
});
