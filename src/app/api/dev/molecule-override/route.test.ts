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

  it("relays the expected revision and answers a stale save with 409 and no publication", async () => {
    mocks.mutation.mockResolvedValue({
      status: "conflict",
      server: { updatedAt: "2026-09-02T00:00:00.000Z", updatedBy: "OTHER" },
    });
    const response = await POST(
      postRequest({
        slug: "2c-b",
        molblock: "mol",
        svg: "<svg />",
        expectedUpdatedAt: "2026-09-01T00:00:00.000Z",
      }),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.conflict).toEqual({ updatedAt: "2026-09-02T00:00:00.000Z", updatedBy: "OTHER" });
    expect(body.error).toMatch(/saved this depiction after you opened it/);
    expect(mocks.mutation).toHaveBeenCalledWith(
      "moleculeOverrides.save",
      expect.objectContaining({ expectedUpdatedAt: "2026-09-01T00:00:00.000Z" }),
    );
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("refuses a save that omits the revision the editor loaded before touching Postgres", async () => {
    const response = await POST(postRequest({ slug: "2c-b", molblock: "mol", svg: "<svg />" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/expectedUpdatedAt/);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses an empty expected revision before touching Postgres", async () => {
    const response = await POST(
      postRequest({ slug: "2c-b", molblock: "mol", svg: "<svg />", expectedUpdatedAt: "" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
