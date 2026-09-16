import { createHash } from "node:crypto";
import { PostgresError } from "@server/postgres/runtime/values";
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

  it("returns the roster as the signed-in admin and names them as self", async () => {
    const members = [{ email: "ada@example.com", username: "ada", role: "editor" }];
    mocks.query.mockResolvedValue(members);

    const response = await GET(new Request("https://dev.dose.wiki/api/dev/members"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, self: "admin@example.com", members });
    expect(mocks.query).toHaveBeenCalledWith("memberships.listRoster", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
    });
  });

  it("changes a role as the signed-in admin and refuses any role it cannot hand out", async () => {
    mocks.mutation.mockResolvedValue(null);

    for (const role of ["contributor", "translator", "editor", "editor_translator"]) {
      const glossaryLocales = role.includes("translator") ? ["nl"] : [];
      const response = await rolePost(post("role", { email: " Ada@Example.com ", role, glossaryLocales }));
      expect(response.status, role).toBe(200);
      expect(mocks.mutation).toHaveBeenLastCalledWith("memberships.setRole", {
        apiKey: "admin-key",
        actorEmail: "admin@example.com",
        email: "ada@example.com",
        role,
        glossaryLocales,
      });
    }

    mocks.mutation.mockClear();
    for (const role of ["admin", "viewer", "", undefined]) {
      const refused = await rolePost(post("role", { email: "ada@example.com", role }));
      expect(refused.status, String(role)).toBe(400);
    }
    expect(mocks.mutation).not.toHaveBeenCalled();
    for (const body of [{ role: "translator" }, { role: "editor_translator", glossaryLocales: ["xx"] }, { role: "editor", glossaryLocales: ["nl"] }]) {
      expect((await rolePost(post("role", { email: "ada@example.com", ...body }))).status).toBe(400);
    }
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("bans and unbans as the signed-in admin", async () => {
    mocks.mutation.mockResolvedValue(null);

    expect((await banPost(post("ban", { email: "ada@example.com" }))).status).toBe(200);
    expect(mocks.mutation).toHaveBeenLastCalledWith("memberships.ban", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      email: "ada@example.com",
    });

    expect((await unbanPost(post("unban", { email: "ada@example.com" }))).status).toBe(200);
    expect(mocks.mutation).toHaveBeenLastCalledWith("memberships.unban", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      email: "ada@example.com",
    });
  });

  it("refuses a missing email on every action without calling Postgres", async () => {
    for (const [path, handler] of ACTIONS) {
      const response = await handler(post(path, { role: "editor" }));
      expect(response.status, path).toBe(400);
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

  it("forwards a deliberate Postgres refusal as a 4xx with its message", async () => {
    mocks.mutation.mockRejectedValue(
      new PostgresError({ code: "SELF_TARGET", message: "You cannot change your own membership." }),
    );

    const response = await banPost(post("ban", { email: "admin@example.com" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "You cannot change your own membership.",
    });
  });
});
