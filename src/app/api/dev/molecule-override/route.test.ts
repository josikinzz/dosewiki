import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { DELETE, GET, POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  makeFunctionReference: (name: string) => ({ name }),
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
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
}));

const publishMocks = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
}));

const postRequest = (body: Record<string, unknown>) =>
  new Request("https://dose.wiki/api/dev/molecule-override", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });

const deleteRequest = (slug: string) =>
  new Request(`https://dose.wiki/api/dev/molecule-override?slug=${slug}`, { method: "DELETE", headers: { Origin: "https://dose.wiki" } });

describe("molecule override route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", {
      email: "admin@example.com",
      name: "Admin",
    }));
    mocks.query.mockReset();
    mocks.mutation.mockReset();
    mocks.getServerDataWriteCapability.mockReset();
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { query: mocks.query, mutation: mocks.mutation }, adminKey: "admin-key" },
    });
    publishMocks.publishPublicCache.mockClear();
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
    expect(mocks.query).toHaveBeenCalledWith(
      { name: "moleculeEditor:getEditSource" },
      { apiKey: "admin-key", actorEmail: "admin@example.com", slug: "2c-b" },
    );
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
  });

  it("refuses an editor session on every verb before touching Postgres", async () => {
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

  it("publishes the saved depiction so both public deployments redraw it", async () => {
    mocks.mutation.mockResolvedValue({ updated: true });
    const response = await POST(postRequest({ slug: "2c-b", molblock: "mol", svg: "<svg />" }));

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "molecule", slug: "2c-b" }],
      source: "manual",
    });
  });

  it("publishes the class index alongside a class depiction", async () => {
    mocks.mutation.mockResolvedValue({ updated: true });
    const response = await POST(
      postRequest({ slug: "class:tryptamines", molblock: "mol", svg: "<svg />" }),
    );

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "molecule", slug: "class:tryptamines" }, { kind: "chemical-class-lists" }],
      source: "manual",
    });
  });

  it("publishes the depiction it removed", async () => {
    mocks.mutation.mockResolvedValue({ deleted: true });
    const response = await DELETE(deleteRequest("2c-b"));

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "molecule", slug: "2c-b" }],
      source: "manual",
    });
  });
});
