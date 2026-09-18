import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    substanceGalleries: {
      getCurationMatchDigest: "substanceGalleries.getCurationMatchDigest",
      listCurationCandidatesPage: "substanceGalleries.listCurationCandidatesPage",
    },
  },
}));

const authMocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const dataMocks = vi.hoisted(() => ({
  query: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: dataMocks.getServerDataWriteCapability,
}));

function candidate(slug: string, title: string, matchCount = 0) {
  return {
    slug,
    title,
    match_count: matchCount,
    curated: false,
    curated_count: 0,
    removed_count: 0,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockResolvedValue({
    ok: true,
    session: { user: { email: "editor@example.com", name: "Editor" } },
    role: "editor",
  });
  dataMocks.getServerDataWriteCapability.mockReturnValue({
    ok: true,
    capability: { client: { query: dataMocks.query }, adminKey: "admin-key" },
  });
});

describe("batched substance gallery candidates route", () => {
  it("refuses a non-editor before touching Postgres", async () => {
    authMocks.requireRoleSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Editor session required." }, { status: 401 }),
    });
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/replications/substances"));

    expect(response.status).toBe(401);
    expect(dataMocks.query).not.toHaveBeenCalled();
  });

  it("reads the corpus digest once, drains the cursor into one sorted response, and drops ambiguous slugs", async () => {
    const digest = [{ route: "lsd", drugClass: null, visualDisconnection: false, count: 5 }];
    dataMocks.query
      .mockResolvedValueOnce(digest)
      .mockResolvedValueOnce({
        items: [candidate("lsd", "LSD", 5), candidate("twin", "Twin A")],
        cursor: "cursor-1",
        isDone: false,
      })
      .mockResolvedValueOnce({
        items: [candidate("twin", "Twin B"), candidate("2c-b", "2C-B", 2)],
        cursor: "cursor-2",
        isDone: true,
      });
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/replications/substances"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      substances: [candidate("2c-b", "2C-B", 2), candidate("lsd", "LSD", 5)],
    });
    expect(dataMocks.query).toHaveBeenCalledTimes(3);
    expect(dataMocks.query).toHaveBeenNthCalledWith(
      1,
      "substanceGalleries.getCurationMatchDigest",
      { apiKey: "admin-key" },
    );
    expect(dataMocks.query).toHaveBeenLastCalledWith(
      "substanceGalleries.listCurationCandidatesPage",
      { apiKey: "admin-key", digest, cursor: "cursor-1", limit: 32 },
    );
  });
});
