import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { DELETE, POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
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

const dataMocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: dataMocks.getServerDataWriteCapability,
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
  dataMocks.getServerDataWriteCapability.mockReturnValue({
    ok: true,
    capability: { client: { mutation: dataMocks.mutation }, adminKey: "admin-key" },
  });
});

describe("copy block route", () => {
  it("refuses an editor saving a block with 403 before touching Postgres", async () => {
    const response = await POST(jsonRequest("POST", blockBody));

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(dataMocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("lets an admin save a block as themselves", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    dataMocks.mutation.mockResolvedValue({ updated: true, key: "home-hero", revision: 1, replayed: false, unchanged: false });

    const response = await POST(jsonRequest("POST", blockBody));

    expect(response.status).toBe(200);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(await response.json()).toMatchObject({ revision: 1, replayed: false, unchanged: false });
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "copy" }],
      source: "manual",
    });
  });

  it("refuses an editor resetting a block with 403 before touching Postgres", async () => {
    const response = await DELETE(jsonRequest("DELETE", { key: "home-hero" }));

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(dataMocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("lets an admin reset a block", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    dataMocks.mutation.mockResolvedValue({ removed: true, key: "home-hero", revision: 1, replayed: false, unchanged: false });

    const response = await DELETE(jsonRequest("DELETE", { key: "home-hero" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ revision: 1, replayed: false, unchanged: false });
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "copy" }],
      source: "manual",
    });
  });
});
