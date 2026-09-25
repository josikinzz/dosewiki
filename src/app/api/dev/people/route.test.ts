import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

import { GET } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    memberships: { listRoster: "memberships.listRoster" },
    contributorProfiles: { listMembershipLinks: "contributorProfiles.listMembershipLinks" },
  },
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: () => ({
    ok: true,
    capability: { client: { query: mocks.query, mutation: vi.fn() }, adminKey: "admin-key" },
  }),
}));

const ADMIN = { email: "admin@example.com", name: "Admin" };
const request = () => new Request("https://dev.dose.wiki/api/dev/people");

describe("people route", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", ADMIN));
  });

  it("refuses every role below admin before touching Postgres", async () => {
    for (const role of ["editor", "translator", "contributor"] as const) {
      authMocks.requireRoleSession.mockImplementation(roleSessionFor(role));
      expect((await GET(request())).status, role).toBe(403);
    }
    for (const call of authMocks.requireRoleSession.mock.calls) {
      expect(call[0]).toBe("admin");
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns the roster and the profile links, read as the signed-in admin", async () => {
    const members = [{ email: "ada@example.com", username: "ada", role: "editor" }];
    const links = [{ key: "ADA", membershipEmail: "ada@example.com" }];
    mocks.query.mockImplementation(async (name: string) =>
      name === "memberships.listRoster" ? members : links,
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, self: "admin@example.com", members, links });
    for (const name of ["memberships.listRoster", "contributorProfiles.listMembershipLinks"]) {
      expect(mocks.query).toHaveBeenCalledWith(name, { apiKey: "admin-key", actorEmail: "admin@example.com" });
    }
  });
});
