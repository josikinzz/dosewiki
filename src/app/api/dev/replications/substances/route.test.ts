import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../convex/_generated/api", () => ({
  api: {
    substanceGalleries: {
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

const convexMocks = vi.hoisted(() => ({
  query: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: convexMocks.getServerConvexWriteCapability,
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
  convexMocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: { client: { query: convexMocks.query }, adminKey: "admin-key" },
  });
});

describe("batched substance gallery candidates route", () => {
  it("refuses a non-editor before touching Convex", async () => {
    authMocks.requireRoleSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Editor session required." }, { status: 401 }),
    });
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/replications/substances"));

    expect(response.status).toBe(401);
    expect(convexMocks.query).not.toHaveBeenCalled();
  });

  it("drains the cursor into one sorted response and drops ambiguous slugs", async () => {
    convexMocks.query
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
    expect(convexMocks.query).toHaveBeenCalledTimes(2);
    expect(convexMocks.query).toHaveBeenLastCalledWith(
      "substanceGalleries.listCurationCandidatesPage",
      { apiKey: "admin-key", cursor: "cursor-1", limit: 100 },
    );
  });
});
