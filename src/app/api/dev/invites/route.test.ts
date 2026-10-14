import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { hashInviteCode, normalizeInviteCode } from "@server/auth/inviteCodes";
import { GET, POST } from "./route";
import { POST as REVOKE } from "./[id]/revoke/route";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    inviteCodes: {
      list: "inviteCodes.list",
      mint: "inviteCodes.mint",
      revoke: "inviteCodes.revoke",
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

const dataMocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: () => ({
    ok: true,
    capability: {
      client: { query: dataMocks.query, mutation: dataMocks.mutation },
      adminKey: "admin-key",
    },
  }),
}));

const summary = {
  id: "inv1",
  role: "editor",
  createdBy: "admin@example.com",
  createdAt: "2026-09-03T12:00:00.000Z",
  expiresAt: "2026-09-10T12:00:00.000Z",
  maxUses: 1,
  redemptions: [],
  status: "active",
};

const listRequest = () => new Request("https://dev.dose.wiki/api/dev/invites");

const mintRequest = (body: unknown) =>
  new Request("https://dev.dose.wiki/api/dev/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dev.dose.wiki" },
    body: JSON.stringify(body),
  });

const revokeRequest = (id: string) =>
  new Request(`https://dev.dose.wiki/api/dev/invites/${id}/revoke`, { method: "POST", headers: { Origin: "https://dev.dose.wiki" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockImplementation(
    roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
  );
  dataMocks.query.mockResolvedValue({ invites: [summary], continuationCursor: null });
  dataMocks.mutation.mockResolvedValue(summary);
});

describe("GET /api/dev/invites", () => {
  it("refuses an editor with 403 before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await GET(listRequest());

    expect(response.status).toBe(403);
    expect(dataMocks.query).not.toHaveBeenCalled();
  });

});

describe("POST /api/dev/invites", () => {
  it("refuses an editor with 403 and never mints", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(mintRequest({ role: "editor" }));

    expect(response.status).toBe(403);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller with 401", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor(null));

    expect((await POST(mintRequest({ role: "editor" }))).status).toBe(401);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses to mint an admin invite without calling Postgres", async () => {
    expect((await POST(mintRequest({ role: "admin" }))).status).toBe(400);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  it("mints with the hashed code and returns the plaintext once with the row", async () => {
    const response = await POST(
      mintRequest({ role: "contributor", note: " For Ada ", expiresInDays: "14", maxUses: 2 }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ ok: true, code: expect.any(String), invite: summary });
    expect(payload.code).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){5}$/);

    expect(dataMocks.mutation).toHaveBeenCalledTimes(1);
    const [name, args] = dataMocks.mutation.mock.calls[0];
    expect(name).toBe("inviteCodes.mint");
    expect(args).toEqual({
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      role: "contributor",
      glossaryLocales: [],
      codeHash: hashInviteCode(normalizeInviteCode(payload.code)),
      note: "For Ada",
      expiresInDays: 14,
      maxUses: 2,
    });
    expect(JSON.stringify(payload)).not.toContain(args.codeHash);
  });
});

describe("POST /api/dev/invites/[id]/revoke", () => {
  it("refuses an editor with 403 before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    expect((await REVOKE(revokeRequest("inv1"))).status).toBe(403);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });
});
