import { PostgresError } from "@server/postgres/runtime/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
  mutation: vi.fn(),
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

import { POST } from "./route";

/** How the Postgres HTTP client rebuilds a thrown `PostgresError` on this side. */
function forwarded(data: unknown) {
  const error = new PostgresError("Server Error");
  (error as { data: unknown }).data = data;
  return error;
}

function postOwner(slug: string, body: unknown): Request {
  return new Request(`https://dose.wiki/api/dev/trip-reports/${slug}/owner`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.requireRoleSession
    .mockReset()
    .mockImplementation(roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }));
  mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  mocks.mutation.mockReset().mockResolvedValue({ slug: "alpine-clarity", ownerEmail: "owner@example.com" });
  mocks.getServerDataWriteCapability.mockReset().mockReturnValue({
    ok: true,
    capability: {
      adminKey: "admin-key",
      getAdminIntentToken: vi.fn(() => "scoped-token"),
      client: { query: vi.fn(), mutation: mocks.mutation },
    },
  });
});

describe("dev trip report owner route", () => {
  it("lets an admin assign an owner by slug, forwarding the session as actor", async () => {
    const response = await POST(postOwner("alpine-clarity", { email: " Owner@Example.com " }));

    expect(response.status).toBe(200);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "editorSmallWrite");
    expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), {
      apiKey: "scoped-token",
      actorEmail: "admin@example.com",
      slug: "alpine-clarity",
      email: "Owner@Example.com",
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      slug: "alpine-clarity",
      ownerEmail: "owner@example.com",
    });
  });

  it("refuses an editor before touching Postgres", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(postOwner("alpine-clarity", { email: "owner@example.com" }));

    expect(response.status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects a body without an email", async () => {
    const response = await POST(postOwner("alpine-clarity", { email: "  " }));

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("relays an unknown member as a 400 carrying the Postgres code", async () => {
    mocks.mutation.mockRejectedValue(
      forwarded({ code: "MEMBER_NOT_FOUND", message: "No membership for nobody@example.com." }),
    );

    const response = await POST(postOwner("alpine-clarity", { email: "nobody@example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "MEMBER_NOT_FOUND" });
  });
});
