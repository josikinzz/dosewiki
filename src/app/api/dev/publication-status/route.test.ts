import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { GET } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: { publicationRecovery: { status: "publicationRecovery.status" } },
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
vi.mock("@/lib/auth/requireEditorSession", () => ({ requireRoleSession: authMocks.requireRoleSession }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));

const dataMocks = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), getServerDataWriteCapability: vi.fn() }));
vi.mock("@server/data/serverWriteCapability", () => ({ getServerDataWriteCapability: dataMocks.getServerDataWriteCapability }));

const status = (...targets: unknown[]) => new Request(
  `https://dose.wiki/api/dev/publication-status?${targets.map((target) => `target=${encodeURIComponent(typeof target === "string" ? target : JSON.stringify(target))}`).join("&")}`,
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor", { email: "owner@example.com" }));
  dataMocks.getServerDataWriteCapability.mockReturnValue({
    ok: true, capability: { client: { query: dataMocks.query, mutation: dataMocks.mutation }, adminKey: "admin-key" },
  });
});

describe("publication status route", () => {
  it("reads the named identities for the signed-in member and never writes", async () => {
    dataMocks.query.mockResolvedValue([{ key: "k", state: "delivered", translations: "queued" }]);
    const response = await GET(status({ kind: "article", slug: "lsd" }, { kind: "banners" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, publications: [{ key: "k", state: "delivered", translations: "queued" }] });
    expect(dataMocks.query).toHaveBeenCalledWith("publicationRecovery.status", expect.objectContaining({
      actorEmail: "owner@example.com", targets: [{ kind: "article", slug: "lsd" }, { kind: "banners" }],
    }));
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses unknown targets and signed-out callers before reading", async () => {
    expect((await GET(status({ kind: "anything", slug: "x" }))).status).toBe(400);
    expect((await GET(status("not json"))).status).toBe(400);
    expect((await GET(status())).status).toBe(400);
    authMocks.requireRoleSession.mockImplementation(roleSessionFor(null));
    expect((await GET(status({ kind: "article", slug: "lsd" }))).status).toBe(401);
    expect(dataMocks.query).not.toHaveBeenCalled();
  });
});
