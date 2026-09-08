import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../convex/_generated/api", () => ({
  api: {
    replications: {
      updateEditorialFields: "replications.updateEditorialFields",
      bulkUpdateEditorialFields: "replications.bulkUpdateEditorialFields",
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
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

import { POST } from "./route";

const snapshot = {
  title: "Drifting",
  artist: "Archive Artist",
  role: "replication",
  effect_slug: "drifting",
  credit_line: null,
  effect_tags: [],
};

function editorialRequest(body: Record<string, unknown>) {
  return new Request("https://dose.wiki/api/dev/replications/editorial", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

const singleEdit = {
  mode: "single",
  id: "replication-id",
  expected: snapshot,
  updates: { ...snapshot, title: "Drifting (revised)" },
};

const bulkEdit = { mode: "bulk", ids: ["replication-id"], artist: "Renamed Artist" };

describe("replication editorial route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { mutation: mocks.mutation },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "maintenance-token"),
      },
    });
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
  });

  it("refuses an editor's single edit with 403 before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(editorialRequest(singleEdit));

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("refuses an editor's bulk edit with 403 before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(editorialRequest(bulkEdit));

    expect(response.status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("applies an admin's single edit and publishes both effect pages", async () => {
    mocks.mutation.mockResolvedValue({ success: true, slug: "drifting-replication" });

    const response = await POST(
      editorialRequest({
        ...singleEdit,
        updates: { ...snapshot, effect_slug: "visual-acuity-enhancement" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, updated: 1, slugs: ["drifting-replication"] });
    expect(mocks.mutation).toHaveBeenCalledWith(
      "replications.updateEditorialFields",
      expect.objectContaining({
        apiKey: "maintenance-token",
        actorEmail: "admin@example.com",
        id: "replication-id",
      }),
    );
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [
        { kind: "replication-collections" },
        { kind: "effect", slug: "drifting" },
        { kind: "effect", slug: "visual-acuity-enhancement" },
      ],
      source: "manual",
    });
  });

  it("applies an admin's bulk edit", async () => {
    mocks.mutation.mockResolvedValue({ updated: 1, slugs: ["drifting-replication"] });

    const response = await POST(editorialRequest(bulkEdit));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, updated: 1, slugs: ["drifting-replication"] });
    expect(mocks.mutation).toHaveBeenCalledWith(
      "replications.bulkUpdateEditorialFields",
      expect.objectContaining({ ids: ["replication-id"], artist: "Renamed Artist" }),
    );
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "replication-collections" }],
      source: "manual",
    });
  });

  it("rejects a body with neither mode before reaching Convex", async () => {
    const response = await POST(editorialRequest({ id: "replication-id" }));

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
