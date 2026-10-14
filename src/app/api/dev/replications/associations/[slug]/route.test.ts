import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    substanceGalleries: {
      getReplicationAssociationsPage: "substanceGalleries.getReplicationAssociationsPage",
      setReplicationExclusions: "substanceGalleries.setReplicationExclusions",
      setReplicationDirectAssociation:
        "substanceGalleries.setReplicationDirectAssociation",
    },
  },
}));

const publishMocks = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
}));

const authMocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const dataMocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: dataMocks.getServerDataWriteCapability,
}));

function readRequest(slug = "tracers-hand") {
  return new Request(`https://dose.wiki/api/dev/replications/associations/${slug}`);
}

function saveRequest(body: unknown, slug = "tracers-hand") {
  return new Request(`https://dose.wiki/api/dev/replications/associations/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown, slug = "tracers-hand") {
  return new Request(
    `https://dosewiki-admin.vercel.app/api/dev/replications/associations/${slug}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: "https://dosewiki-admin.vercel.app" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockImplementation(
    roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
  );
  dataMocks.getServerDataWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: dataMocks.query, mutation: dataMocks.mutation },
      adminKey: "admin-key",
    },
  });
});

describe("replication associations route auth", () => {
  it("refuses a non-editor before touching Postgres, on both verbs", async () => {
    authMocks.requireRoleSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Editor session required." }, { status: 401 }),
    });
    const { GET, PATCH, POST } = await import("./route");

    const read = await GET(readRequest());
    const patch = await PATCH(
      patchRequest({ substanceSlug: "lsd", assigned: true }),
    );
    const write = await POST(saveRequest({ excludedSubstanceSlugs: [] }));

    expect(read.status).toBe(401);
    expect(patch.status).toBe(401);
    expect(write.status).toBe(401);
    expect(dataMocks.query).not.toHaveBeenCalled();
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  it("lets an editor read but refuses both writes with 403 before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    dataMocks.query.mockResolvedValue({ items: [], cursor: "", isDone: true });
    const { GET, PATCH, POST } = await import("./route");

    const read = await GET(readRequest());
    const patch = await PATCH(patchRequest({ substanceSlug: "lsd", assigned: true }));
    const write = await POST(saveRequest({ excludedSubstanceSlugs: ["lsd"] }));

    expect(read.status).toBe(200);
    expect(patch.status).toBe(403);
    expect(write.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("editor");
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(dataMocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });
});
