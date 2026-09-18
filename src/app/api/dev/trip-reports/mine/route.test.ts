import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
  query: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: mocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
}));

import { GET } from "./route";

const owner = { email: "owner@example.com", name: "Owner" };

const ownedRows = [
  { id: "r1", slug: "alpine-clarity", title: "Alpine clarity", ownerEmail: owner.email, createdAt: 1 },
];

beforeEach(() => {
  mocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("contributor", owner));
  mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  mocks.query.mockReset().mockResolvedValue(ownedRows);
  mocks.getServerDataWriteCapability.mockReset().mockReturnValue({
    ok: true,
    capability: {
      adminKey: "admin-key",
      getAdminIntentToken: vi.fn(() => "scoped-token"),
      client: { query: mocks.query, mutation: vi.fn() },
    },
  });
});

describe("dev owned trip reports route", () => {
  it("lists the contributor's own reports as the Postgres actor without echoing the owner email", async () => {
    const response = await GET(new Request("https://dose.wiki/api/dev/trip-reports/mine"));

    expect(response.status).toBe(200);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "diagnosticRead");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.anything(),
      { apiKey: "scoped-token", actorEmail: owner.email },
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      reports: [{ id: "r1", slug: "alpine-clarity", title: "Alpine clarity", createdAt: 1 }],
    });
  });

  it("refuses a signed-out caller without touching Postgres", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor(null));

    const response = await GET(new Request("https://dose.wiki/api/dev/trip-reports/mine"));

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("lets an admin ask for every owned report, and refuses that scope to anyone else", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor("admin", { email: "admin@example.com" }));
    const all = await GET(new Request("https://dose.wiki/api/dev/trip-reports/mine?scope=all"));
    expect(all.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorEmail: "admin@example.com", all: true }),
    );

    mocks.query.mockClear();
    mocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const refused = await GET(new Request("https://dose.wiki/api/dev/trip-reports/mine?scope=all"));
    expect(refused.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
