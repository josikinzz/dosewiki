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

const cacheMocks = vi.hoisted(() => ({ revalidateTag: vi.fn() }));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: cacheMocks.revalidateTag,
}));

vi.mock("@server/convex/publicData", () => ({
  PUBLIC_CONVEX_CACHE_TAGS: { copy: "convex-public:copy" },
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
  it("lets an editor save a block as themselves", async () => {
    convexMocks.mutation.mockResolvedValue({ updated: true, key: "home-hero" });

    const response = await POST(jsonRequest("POST", blockBody));

    expect(response.status).toBe(200);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("editor");
    expect(convexMocks.mutation).toHaveBeenCalledWith(
      "copyBlocks.upsert",
      expect.objectContaining({ apiKey: "admin-key", actorEmail: "editor@example.com", key: "home-hero" }),
    );
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("convex-public:copy", { expire: 0 });
  });

  it("refuses an editor resetting a block with 403 before touching Convex", async () => {
    const response = await DELETE(jsonRequest("DELETE", { key: "home-hero" }));

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(convexMocks.mutation).not.toHaveBeenCalled();
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("lets an admin reset a block", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    convexMocks.mutation.mockResolvedValue({ removed: true, key: "home-hero" });

    const response = await DELETE(jsonRequest("DELETE", { key: "home-hero" }));

    expect(response.status).toBe(200);
    expect(convexMocks.mutation).toHaveBeenCalledWith("copyBlocks.remove", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      key: "home-hero",
    });
  });
});
