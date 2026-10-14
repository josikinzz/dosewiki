import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

import { GET } from "./route";
import { POST as banPost } from "./ban/route";
import { POST as resetPost } from "./reset/route";
import { POST as rolePost } from "./role/route";
import { POST as unbanPost } from "./unban/route";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    memberships: {
      listRoster: "memberships.listRoster",
      setRole: "memberships.setRole",
      ban: "memberships.ban",
      unban: "memberships.unban",
      issuePasswordReset: "memberships.issuePasswordReset",
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
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: () => ({
    ok: true,
    capability: { client: { query: mocks.query, mutation: mocks.mutation }, adminKey: "admin-key" },
  }),
}));

const ADMIN = { email: "admin@example.com", name: "Admin" };

const post = (path: string, body: Record<string, unknown>) =>
  new Request(`https://dev.dose.wiki/api/dev/members/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://dev.dose.wiki" },
    body: JSON.stringify(body),
  });

const ACTIONS: [string, (request: Request) => Promise<Response>, Record<string, unknown>][] = [
  ["role", rolePost, { email: "ada@example.com", role: "contributor" }],
  ["ban", banPost, { email: "ada@example.com" }],
  ["unban", unbanPost, { email: "ada@example.com" }],
  ["reset", resetPost, { email: "ada@example.com" }],
];

describe("members routes", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.mutation.mockReset();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", ADMIN));
  });

  it("refuses an editor on the roster and every action before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const roster = await GET(new Request("https://dev.dose.wiki/api/dev/members"));
    expect(roster.status).toBe(403);

    for (const [path, handler, body] of ACTIONS) {
      const response = await handler(post(path, body));
      expect(response.status, path).toBe(403);
    }

    expect(authMocks.requireRoleSession).toHaveBeenCalledTimes(ACTIONS.length + 1);
    for (const call of authMocks.requireRoleSession.mock.calls) {
      expect(call[0]).toBe("admin");
    }
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses any role it cannot hand out without calling Postgres", async () => {
    for (const role of ["admin", "viewer"]) {
      const refused = await rolePost(post("role", { email: "ada@example.com", role }));
      expect(refused.status, role).toBe(400);
    }
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("issues a reset link once, storing only the sha256 of the token", async () => {
    mocks.mutation.mockResolvedValue(null);

    const response = await resetPost(post("reset", { email: "ada@example.com" }));
    expect(response.status).toBe(200);

    const payload = await response.json();
    const token = new URL(payload.resetPath, "https://dev.dose.wiki").searchParams.get("token") ?? "";
    expect(payload.resetPath.startsWith("/reset-password?token=")).toBe(true);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.mutation).toHaveBeenCalledWith("memberships.issuePasswordReset", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      email: "ada@example.com",
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    expect(JSON.stringify(mocks.mutation.mock.calls)).not.toContain(token);
  });
});
