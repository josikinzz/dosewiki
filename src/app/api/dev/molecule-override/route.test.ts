import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { DELETE, GET, POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    moleculeOverrides: {
      getBySlug: "moleculeOverrides.getBySlug",
      save: "moleculeOverrides.save",
      remove: "moleculeOverrides.remove",
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
  query: vi.fn(),
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

const postRequest = (body: Record<string, unknown>) =>
  new Request("https://dose.wiki/api/dev/molecule-override", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const deleteRequest = (slug: string) =>
  new Request(`https://dose.wiki/api/dev/molecule-override?slug=${slug}`, { method: "DELETE" });

describe("molecule override route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", {
      email: "admin@example.com",
      name: "Admin",
    }));
    mocks.query.mockReset();
    mocks.mutation.mockReset();
    mocks.getServerConvexWriteCapability.mockReset();
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { query: mocks.query, mutation: mocks.mutation }, adminKey: "admin-key" },
    });
  });

  it("loads a selected substance depiction through the authenticated admin deployment", async () => {
    mocks.query.mockResolvedValue({ slug: "2c-b", molblock: "mol", svg: "<svg />" });
    const response = await GET(
      new Request("https://dose.wiki/api/dev/molecule-override?slug=2c-b"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      override: { slug: "2c-b", molblock: "mol", svg: "<svg />" },
    });
    expect(mocks.query).toHaveBeenCalledWith("moleculeOverrides.getBySlug", { slug: "2c-b" });
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
  });

  it("refuses an editor session on every verb before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const responses = await Promise.all([
      GET(new Request("https://dose.wiki/api/dev/molecule-override?slug=2c-b")),
      POST(postRequest({ slug: "2c-b", molblock: "mol", svg: "<svg />" })),
      DELETE(deleteRequest("2c-b")),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
