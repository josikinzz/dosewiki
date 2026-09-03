import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../../convex/_generated/api", () => ({
  api: {
    substanceGalleries: {
      getCurationDetail: "substanceGalleries.getCurationDetail",
      upsert: "substanceGalleries.upsert",
    },
  },
}));

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: cacheMocks.revalidatePath,
  revalidateTag: cacheMocks.revalidateTag,
}));

vi.mock("@server/convex/publicData", () => ({
  PUBLIC_CONVEX_CACHE_TAGS: { replications: "public-replications" },
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
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: convexMocks.getServerConvexWriteCapability,
}));

const DETAIL = {
  substance: { slug: "lsd", title: "LSD" },
  matches: [],
  curation: null,
  effectOptions: [{ slug: "tracers", name: "Tracers" }],
  unmatchedEffectNames: ["Drifting"],
};

function saveRequest(body: unknown, slug = "lsd") {
  return new Request(`https://dose.wiki/api/dev/replications/substances/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockResolvedValue({
    ok: true,
    session: { user: { email: "editor@example.com", name: "Editor" } },
    role: "editor",
  });
  convexMocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: convexMocks.query, mutation: convexMocks.mutation },
      adminKey: "admin-key",
    },
  });
});

describe("substance gallery route auth", () => {
  it("refuses a non-editor before touching Convex, on both verbs", async () => {
    authMocks.requireRoleSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Editor session required." }, { status: 401 }),
    });
    const { GET, POST } = await import("./route");

    const read = await GET(new Request("https://dose.wiki/api/dev/replications/substances/lsd"));
    const write = await POST(saveRequest({ curatedSlugs: [], removedSlugs: [] }));

    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
    expect(convexMocks.query).not.toHaveBeenCalled();
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });
});

describe("substance gallery GET", () => {
  it("returns the detail payload for a known substance", async () => {
    convexMocks.query.mockResolvedValue(DETAIL);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/replications/substances/lsd"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ...DETAIL });
    expect(convexMocks.query).toHaveBeenCalledWith("substanceGalleries.getCurationDetail", {
      apiKey: "admin-key",
      substance_slug: "lsd",
    });
  });

  it("maps a null detail to a 404", async () => {
    convexMocks.query.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/dev/replications/substances/no-such-drug"),
    );

    expect(response.status).toBe(404);
  });

  it("refuses a slug shape no substance has without calling Convex", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/dev/replications/substances/Not%20A%20Slug!"),
    );

    expect(response.status).toBe(404);
    expect(convexMocks.query).not.toHaveBeenCalled();
  });
});

describe("substance gallery POST", () => {
  it("submits full arrays, revalidates, and returns the pruned echo verbatim", async () => {
    convexMocks.mutation.mockResolvedValue({
      status: "ok",
      updated: true,
      substance_slug: "lsd",
      curated_slugs: ["tracers-hand"],
      removed_slugs: ["haze-room"],
      pruned_curated: ["ghost-row"],
      pruned_removed: [],
      updated_at: "2026-02-02T02:02:02.000Z",
      updated_by: "editor@example.com",
    });
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({
        curatedSlugs: ["tracers-hand", "ghost-row"],
        removedSlugs: ["haze-room"],
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      curated_slugs: ["tracers-hand"],
      removed_slugs: ["haze-room"],
      pruned_curated: ["ghost-row"],
      pruned_removed: [],
      updated_at: "2026-02-02T02:02:02.000Z",
      updated_by: "editor@example.com",
    });
    expect(convexMocks.mutation).toHaveBeenCalledWith("substanceGalleries.upsert", {
      apiKey: "admin-key",
      actorEmail: "editor@example.com",
      substance_slug: "lsd",
      curated_slugs: ["tracers-hand", "ghost-row"],
      removed_slugs: ["haze-room"],
      updatedBy: "editor@example.com",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("public-replications", { expire: 0 });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/lsd");
  });

  it("rejects a curated∩excluded overlap before reaching Convex", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({ curatedSlugs: ["tracers-hand"], removedSlugs: ["tracers-hand"] }),
    );

    expect(response.status).toBe(400);
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  it("accepts the legacy underscore slugs the corpus actually holds", async () => {
    convexMocks.mutation.mockResolvedValue({
      status: "ok",
      updated: false,
      substance_slug: "lsd",
      curated_slugs: ["grass_photos_v2_x2-unknown"],
      removed_slugs: [],
      pruned_curated: [],
      pruned_removed: [],
      updated_at: "2026-02-02T02:02:02.000Z",
      updated_by: "editor@example.com",
    });
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({ curatedSlugs: ["grass_photos_v2_x2-unknown"], removedSlugs: [] }),
    );

    expect(response.status).toBe(200);
    expect(convexMocks.mutation).toHaveBeenCalledTimes(1);
  });

  it("rejects a body without both arrays", async () => {
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ curatedSlugs: ["tracers-hand"] }));

    expect(response.status).toBe(400);
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects a non-slug entry", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({ curatedSlugs: ["Not A Slug"], removedSlugs: [] }),
    );

    expect(response.status).toBe(400);
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  it("omits expectedUpdatedAt when the body does not carry it", async () => {
    convexMocks.mutation.mockResolvedValue({
      status: "ok",
      updated: false,
      substance_slug: "lsd",
      curated_slugs: [],
      removed_slugs: [],
      pruned_curated: [],
      pruned_removed: [],
      updated_at: "2026-02-02T02:02:02.000Z",
      updated_by: "editor@example.com",
    });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ curatedSlugs: [], removedSlugs: [] }));

    expect(response.status).toBe(200);
    expect(convexMocks.mutation.mock.calls[0][1]).toMatchObject({ expectedUpdatedAt: undefined });
  });

  it("relays a null expectedUpdatedAt so Convex asserts no curation row exists", async () => {
    convexMocks.mutation.mockResolvedValue({
      status: "ok",
      updated: false,
      substance_slug: "lsd",
      curated_slugs: ["tracers-hand"],
      removed_slugs: [],
      pruned_curated: [],
      pruned_removed: [],
      updated_at: "2026-02-02T02:02:02.000Z",
      updated_by: "editor@example.com",
    });
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({
        curatedSlugs: ["tracers-hand"],
        removedSlugs: [],
        expectedUpdatedAt: null,
      }),
    );

    expect(response.status).toBe(200);
    expect(convexMocks.mutation.mock.calls[0][1]).toMatchObject({ expectedUpdatedAt: null });
  });

  it("rejects a non-string, non-null expectedUpdatedAt before reaching Convex", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({ curatedSlugs: [], removedSlugs: [], expectedUpdatedAt: 17 }),
    );

    expect(response.status).toBe(400);
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  it("reports a stale save as a 409 with the server state and revalidates nothing", async () => {
    convexMocks.mutation.mockResolvedValue({
      status: "conflict",
      server: {
        curated_slugs: ["haze-room"],
        removed_slugs: [],
        updated_at: "2026-03-03T03:03:03.000Z",
        updated_by: "other@example.com",
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({
        curatedSlugs: ["tracers-hand"],
        removedSlugs: [],
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("changed since you loaded it"),
      conflict: {
        curated_slugs: ["haze-room"],
        removed_slugs: [],
        updated_at: "2026-03-03T03:03:03.000Z",
        updated_by: "other@example.com",
      },
    });
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });
});
