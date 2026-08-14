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
  requireEditorSession: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireEditorSession: authMocks.requireEditorSession,
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
  authMocks.requireEditorSession.mockResolvedValue({
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
    authMocks.requireEditorSession.mockResolvedValue({
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
      updated: true,
      substance_slug: "lsd",
      curated_slugs: ["tracers-hand"],
      removed_slugs: ["haze-room"],
      pruned_curated: ["ghost-row"],
      pruned_removed: [],
    });
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({
        curatedSlugs: ["tracers-hand", "ghost-row"],
        removedSlugs: ["haze-room"],
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      curated_slugs: ["tracers-hand"],
      removed_slugs: ["haze-room"],
      pruned_curated: ["ghost-row"],
      pruned_removed: [],
    });
    expect(convexMocks.mutation).toHaveBeenCalledWith("substanceGalleries.upsert", {
      apiKey: "admin-key",
      actorEmail: "editor@example.com",
      substance_slug: "lsd",
      curated_slugs: ["tracers-hand", "ghost-row"],
      removed_slugs: ["haze-room"],
      updatedBy: "editor@example.com",
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
      updated: false,
      substance_slug: "lsd",
      curated_slugs: ["grass_photos_v2_x2-unknown"],
      removed_slugs: [],
      pruned_curated: [],
      pruned_removed: [],
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
});
