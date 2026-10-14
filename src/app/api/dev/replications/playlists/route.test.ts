import { PostgresError } from "@server/postgres/runtime/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";
import type { AppRole } from "@/lib/auth/roles";

import { GET, POST } from "./route";
import { DELETE } from "./[key]/route";
import { POST as ASSIGN_OWNER } from "./[key]/owner/route";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    replicationPlaylists: {
      list: "replicationPlaylists.list",
      listOwned: "replicationPlaylists.listOwned",
      get: "replicationPlaylists.get",
      upsert: "replicationPlaylists.upsert",
      remove: "replicationPlaylists.remove",
      assignOwner: "replicationPlaylists.assignOwner",
    },
  },
}));

const sessionMocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: sessionMocks.requireRoleSession,
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

function signIn(role: AppRole | null, email = "ada@example.com") {
  sessionMocks.requireRoleSession.mockImplementation(roleSessionFor(role, { email, name: "Someone" }));
}

const BASE = "https://dose.wiki/api/dev/replications/playlists";

const post = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: new URL(url).origin },
    body: JSON.stringify(body),
  });

const notOwner = () =>
  new PostgresError({ code: "NOT_OWNER", message: "\"Ada's list\" belongs to ada@example.com; only its owner or an admin may change it." });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/dev/replications/playlists", () => {
  it("refuses a signed-out caller", async () => {
    signIn(null);
    const response = await GET(new Request(BASE));
    expect(response.status).toBe(401);
    expect(dataMocks.query).not.toHaveBeenCalled();
  });
});

describe("POST /api/dev/replications/playlists", () => {
  it("answers 403 with the NOT_OWNER code when a contributor writes to another member's playlist", async () => {
    signIn("contributor", "bob@example.com");
    dataMocks.mutation.mockRejectedValue(notOwner());

    const response = await POST(post(BASE, { key: "adas-list", title: "Taken", slugs: [] }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "NOT_OWNER" });
  });
});

describe("DELETE /api/dev/replications/playlists/[key]", () => {
  it("lets a contributor delete through the contributor floor and maps NOT_OWNER to 403", async () => {
    signIn("contributor", "bob@example.com");
    dataMocks.mutation.mockRejectedValue(notOwner());

    const response = await DELETE(new Request(`${BASE}/adas-list`, { method: "DELETE", headers: { Origin: new URL(BASE).origin } }));

    expect(response.status).toBe(403);
    expect(dataMocks.mutation).toHaveBeenCalledWith("replicationPlaylists.remove", {
      apiKey: "admin-key",
      actorEmail: "bob@example.com",
      key: "adas-list",
    });
  });
});

describe("POST /api/dev/replications/playlists/[key]/owner", () => {
  it("refuses everyone below admin without calling Postgres", async () => {
    signIn("editor", "editor@example.com");
    const response = await ASSIGN_OWNER(post(`${BASE}/house-opener/owner`, { ownerEmail: "ada@example.com" }));
    expect(response.status).toBe(403);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });
});
