import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../convex/_generated/api", () => ({
  api: {
    replications: { generateUploadUrl: "replications.generateUploadUrl" },
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

import { POST } from "./route";

const request = () =>
  new Request("https://dose.wiki/api/dev/replications/upload-url", { method: "POST" });

describe("replication upload-url route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.mutation.mockResolvedValue("https://upload.example.test/");
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { mutation: mocks.mutation },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "maintenance-token"),
      },
    });
  });

  it("refuses an editor with 403 before minting anything", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("mints an upload URL for an admin under the maintenance intent", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, uploadUrl: "https://upload.example.test/" });
    expect(mocks.mutation).toHaveBeenCalledWith("replications.generateUploadUrl", {
      apiKey: "maintenance-token",
      actorEmail: "admin@example.com",
    });
  });
});
