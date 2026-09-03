import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { GET, POST } from "./route";
import { GET as APPLY_GET, POST as APPLY_POST } from "./apply/route";

vi.mock("server-only", () => ({}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const convexMocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: convexMocks.getServerConvexWriteCapability,
}));

function postRequest(path: string, body: unknown) {
  return new Request(`https://dose.wiki/api/dev/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockImplementation(
    roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
  );
  convexMocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: convexMocks.query, mutation: convexMocks.mutation },
      adminKey: "admin-key",
    },
  });
});

describe("molecule class template routes", () => {
  it("refuses an editor session with 403 on every verb before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const responses = await Promise.all([
      GET(new Request("https://dose.wiki/api/dev/molecule-class-template?list=1")),
      POST(postRequest("molecule-class-template", { classKey: "phenethylamines", molblock: "mol" })),
      APPLY_GET(new Request("https://dose.wiki/api/dev/molecule-class-template/apply?classKey=phenethylamines")),
      APPLY_POST(postRequest("molecule-class-template/apply", { classKey: "phenethylamines", slugs: ["2c-b"] })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
    expect(authMocks.requireRoleSession).toHaveBeenCalledTimes(4);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(convexMocks.query).not.toHaveBeenCalled();
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  it("lets an admin list the saved template keys", async () => {
    convexMocks.query.mockResolvedValue(["phenethylamines"]);

    const response = await GET(new Request("https://dose.wiki/api/dev/molecule-class-template?list=1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, templates: ["phenethylamines"] });
  });

  it("saves a template as the admin actor", async () => {
    convexMocks.mutation.mockResolvedValue({ updated: true, updatedAt: 1 });

    const response = await POST(
      postRequest("molecule-class-template", { classKey: "phenethylamines", molblock: "mol" }),
    );

    expect(response.status).toBe(200);
    expect(convexMocks.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        apiKey: "admin-key",
        actorEmail: "admin@example.com",
        classKey: "phenethylamines",
      }),
    );
  });
});
