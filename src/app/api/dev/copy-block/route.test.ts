import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { DELETE, POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    copyBlocks: {
      upsert: "copyBlocks.upsert",
      remove: "copyBlocks.remove",
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

const convexMocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: convexMocks.getServerConvexWriteCapability,
}));

function jsonRequest(method: "POST" | "DELETE", body: unknown) {
  return new Request("https://dose.wiki/api/dev/copy-block", {
    method,
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify({ expected: null, expectedRevision: 0, operationId: "copy-fixture-operation", ...(body as Record<string, unknown>) }),
  });
}

const blockBody = {
  key: "home-hero",
  kind: "plain",
  label: "Home hero",
  group: "Home",
  body: "Welcome.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
  convexMocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: { client: { mutation: convexMocks.mutation }, adminKey: "admin-key" },
  });
});

describe("copy block route", () => {
  it("refuses an editor saving a block with 403 before touching Convex", async () => {
    const response = await POST(jsonRequest("POST", blockBody));

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(convexMocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("lets an admin save a block as themselves", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    convexMocks.mutation.mockResolvedValue({ updated: true, key: "home-hero", revision: 1, replayed: false, unchanged: false });

    const response = await POST(jsonRequest("POST", blockBody));

    expect(response.status).toBe(200);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(await response.json()).toMatchObject({ revision: 1, replayed: false, unchanged: false });
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "copy" }],
      source: "manual",
    });
  });

  it("refuses an editor resetting a block with 403 before touching Convex", async () => {
    const response = await DELETE(jsonRequest("DELETE", { key: "home-hero" }));

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(convexMocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("lets an admin reset a block", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    convexMocks.mutation.mockResolvedValue({ removed: true, key: "home-hero", revision: 1, replayed: false, unchanged: false });

    const response = await DELETE(jsonRequest("DELETE", { key: "home-hero" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ revision: 1, replayed: false, unchanged: false });
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "copy" }],
      source: "manual",
    });
  });
});
