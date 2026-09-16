import { PostgresError } from "@server/postgres/runtime/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";
import type { AppRole } from "@/lib/auth/roles";

import { GET, POST } from "./route";
import { DELETE, GET as GET_BY_KEY } from "./[key]/route";
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

const savedPlaylist = {
  status: "ok",
  updated: false,
  key: "adas-list",
  title: "Ada's list",
  replication_slugs: ["alpha"],
  pruned: [],
  updated_at: "2026-02-01T00:00:00.000Z",
  updated_by: "ada@example.com",
  owner_email: "ada@example.com",
  editable: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/dev/replications/playlists", () => {
  it("lists a contributor's own playlists through listOwned", async () => {
    signIn("contributor");
    dataMocks.query.mockResolvedValue([{ key: "adas-list", editable: true }]);

    const response = await GET(new Request(BASE));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, playlists: [{ key: "adas-list", editable: true }] });
    expect(dataMocks.query).toHaveBeenCalledWith("replicationPlaylists.listOwned", {
      apiKey: "admin-key",
      actorEmail: "ada@example.com",
    });
  });

  it("lists every playlist for an editor and an admin through list", async () => {
    dataMocks.query.mockResolvedValue([]);

    signIn("editor", "editor@example.com");
    await GET(new Request(BASE));
    expect(dataMocks.query).toHaveBeenLastCalledWith("replicationPlaylists.list", {
      apiKey: "admin-key",
      actorEmail: "editor@example.com",
    });

    signIn("admin", "admin@example.com");
    await GET(new Request(BASE));
    expect(dataMocks.query).toHaveBeenLastCalledWith("replicationPlaylists.list", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
    });
  });

  it("refuses a signed-out caller", async () => {
    signIn(null);
    const response = await GET(new Request(BASE));
    expect(response.status).toBe(401);
    expect(dataMocks.query).not.toHaveBeenCalled();
  });
});

describe("POST /api/dev/replications/playlists", () => {
  it("saves a contributor's playlist with the session email as the actor", async () => {
    signIn("contributor");
    dataMocks.mutation.mockResolvedValue(savedPlaylist);

    const response = await POST(
      post(BASE, { key: "adas-list", title: "Ada's list", slugs: ["alpha", "alpha"], expectedUpdatedAt: null }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, playlist: savedPlaylist });
    expect(dataMocks.mutation).toHaveBeenCalledWith("replicationPlaylists.upsert", {
      apiKey: "admin-key",
      actorEmail: "ada@example.com",
      key: "adas-list",
      title: "Ada's list",
      replication_slugs: ["alpha"],
      updatedBy: "ada@example.com",
      expectedUpdatedAt: null,
      owner_email: undefined,
    });
  });

  it("answers 403 with the NOT_OWNER code when a contributor writes to another member's playlist", async () => {
    signIn("contributor", "bob@example.com");
    dataMocks.mutation.mockRejectedValue(notOwner());

    const response = await POST(post(BASE, { key: "adas-list", title: "Taken", slugs: [] }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "NOT_OWNER" });
  });

  it("forwards an admin's ownerEmail to Postgres", async () => {
    signIn("admin", "admin@example.com");
    dataMocks.mutation.mockResolvedValue({ ...savedPlaylist, owner_email: "bob@example.com" });

    const response = await POST(
      post(BASE, { key: "for-bob", title: "For Bob", slugs: [], ownerEmail: " Bob@example.com " }),
    );

    expect(response.status).toBe(200);
    expect(dataMocks.mutation).toHaveBeenCalledWith(
      "replicationPlaylists.upsert",
      expect.objectContaining({ actorEmail: "admin@example.com", owner_email: "Bob@example.com" }),
    );
  });

  it("rejects a malformed ownerEmail before reaching Postgres", async () => {
    signIn("admin", "admin@example.com");
    const response = await POST(post(BASE, { key: "for-bob", title: "For Bob", slugs: [], ownerEmail: 7 }));
    expect(response.status).toBe(400);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });
});

describe("GET /api/dev/replications/playlists/[key]", () => {
  it("lets an owning contributor read their playlist, with the actor forwarded for ownership", async () => {
    signIn("contributor");
    dataMocks.query.mockResolvedValue({ key: "adas-list", editable: true });

    const response = await GET_BY_KEY(new Request(`${BASE}/adas-list`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, playlist: { key: "adas-list", editable: true } });
    expect(dataMocks.query).toHaveBeenCalledWith("replicationPlaylists.get", {
      apiKey: "admin-key",
      actorEmail: "ada@example.com",
      key: "adas-list",
    });
  });

  it("answers 404 when Postgres hides a playlist the contributor does not own", async () => {
    signIn("contributor", "bob@example.com");
    dataMocks.query.mockResolvedValue(null);

    const response = await GET_BY_KEY(new Request(`${BASE}/adas-list`));

    expect(response.status).toBe(404);
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

  it("deletes the owner's own playlist", async () => {
    signIn("contributor");
    dataMocks.mutation.mockResolvedValue({ status: "ok", key: "adas-list" });

    const response = await DELETE(new Request(`${BASE}/adas-list`, { method: "DELETE", headers: { Origin: new URL(BASE).origin } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, key: "adas-list" });
  });
});

describe("POST /api/dev/replications/playlists/[key]/owner", () => {
  it("refuses everyone below admin without calling Postgres", async () => {
    signIn("editor", "editor@example.com");
    const response = await ASSIGN_OWNER(post(`${BASE}/house-opener/owner`, { ownerEmail: "ada@example.com" }));
    expect(response.status).toBe(403);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });


  it("clears the owner with null and surfaces an unknown member as a rejection", async () => {
    signIn("admin", "admin@example.com");
    dataMocks.mutation.mockResolvedValueOnce({ status: "ok", key: "house-opener", owner_email: null });

    const cleared = await ASSIGN_OWNER(post(`${BASE}/house-opener/owner`, { ownerEmail: null }));
    expect(cleared.status).toBe(200);
    expect(dataMocks.mutation).toHaveBeenLastCalledWith(
      "replicationPlaylists.assignOwner",
      expect.objectContaining({ ownerEmail: null }),
    );

    dataMocks.mutation.mockRejectedValueOnce(
      new PostgresError({ code: "MEMBER_NOT_FOUND", message: "No membership for ghost@example.com." }),
    );
    const unknown = await ASSIGN_OWNER(post(`${BASE}/house-opener/owner`, { ownerEmail: "ghost@example.com" }));
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toMatchObject({ code: "MEMBER_NOT_FOUND" });
  });

  it("answers 404 for a key no playlist has", async () => {
    signIn("admin", "admin@example.com");
    dataMocks.mutation.mockResolvedValue({ status: "missing", key: "nope" });
    const response = await ASSIGN_OWNER(post(`${BASE}/nope/owner`, { ownerEmail: "ada@example.com" }));
    expect(response.status).toBe(404);
  });
});
