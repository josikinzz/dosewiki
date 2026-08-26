import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../../convex/_generated/api", () => ({
  api: {
    substanceGalleries: {
      getReplicationAssociationsPage: "substanceGalleries.getReplicationAssociationsPage",
      setReplicationExclusions: "substanceGalleries.setReplicationExclusions",
      setReplicationDirectAssociation:
        "substanceGalleries.setReplicationDirectAssociation",
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

const TRACERS_LSD = {
  slug: "lsd",
  title: "LSD",
  matchedVia: "effect_slug" as const,
  effectSlug: "tracers",
  effectName: "Tracers",
  excluded: false,
  curatedPosition: 1,
};

const TRACERS_DMT = {
  slug: "dmt",
  title: "DMT",
  matchedVia: "effect_tags" as const,
  effectSlug: "drifting",
  effectName: "Drifting",
  excluded: true,
  curatedPosition: null,
};

function readRequest(slug = "tracers-hand") {
  return new Request(`https://dose.wiki/api/dev/replications/associations/${slug}`);
}

function saveRequest(body: unknown, slug = "tracers-hand") {
  return new Request(`https://dose.wiki/api/dev/replications/associations/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown, slug = "tracers-hand") {
  return new Request(
    `https://dosewiki-admin.vercel.app/api/dev/replications/associations/${slug}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
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

describe("replication associations route auth", () => {
  it("refuses a non-editor before touching Convex, on both verbs", async () => {
    authMocks.requireEditorSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Editor session required." }, { status: 401 }),
    });
    const { GET, PATCH, POST } = await import("./route");

    const read = await GET(readRequest());
    const patch = await PATCH(
      patchRequest({ substanceSlug: "lsd", assigned: true }),
    );
    const write = await POST(saveRequest({ excludedSubstanceSlugs: [] }));

    expect(read.status).toBe(401);
    expect(patch.status).toBe(401);
    expect(write.status).toBe(401);
    expect(convexMocks.query).not.toHaveBeenCalled();
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });
});

describe("replication associations GET", () => {
  it("drains the cursor and returns the rows sorted by substance title", async () => {
    convexMocks.query
      .mockResolvedValueOnce({ items: [TRACERS_LSD], cursor: "page-2", isDone: false })
      .mockResolvedValueOnce({ items: [TRACERS_DMT], cursor: "end", isDone: true });
    const { GET } = await import("./route");

    const response = await GET(readRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      associations: [TRACERS_DMT, TRACERS_LSD],
    });
    expect(convexMocks.query).toHaveBeenCalledTimes(2);
    expect(convexMocks.query).toHaveBeenNthCalledWith(
      1,
      "substanceGalleries.getReplicationAssociationsPage",
      { apiKey: "admin-key", replicationSlug: "tracers-hand", cursor: undefined, limit: 100 },
    );
    expect(convexMocks.query).toHaveBeenNthCalledWith(
      2,
      "substanceGalleries.getReplicationAssociationsPage",
      { apiKey: "admin-key", replicationSlug: "tracers-hand", cursor: "page-2", limit: 100 },
    );
  });

  it("answers an empty list for a replication on no article", async () => {
    convexMocks.query.mockResolvedValue({ items: [], cursor: "", isDone: true });
    const { GET } = await import("./route");

    const response = await GET(readRequest("clinical-figure-1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, associations: [] });
  });

  it("drops both copies of a slug stored on two articles", async () => {
    convexMocks.query.mockResolvedValue({
      items: [TRACERS_LSD, TRACERS_DMT, { ...TRACERS_LSD, title: "LSD (duplicate)" }],
      cursor: "end",
      isDone: true,
    });
    const { GET } = await import("./route");

    const response = await GET(readRequest());

    expect(await response.json()).toEqual({ ok: true, associations: [TRACERS_DMT] });
  });

  it("refuses a slug shape no replication has without calling Convex", async () => {
    const { GET } = await import("./route");

    const response = await GET(readRequest("Not%20A%20Slug!"));

    expect(response.status).toBe(404);
    expect(convexMocks.query).not.toHaveBeenCalled();
  });
});

describe("replication associations PATCH", () => {
  it("assigns one replication directly and revalidates its article", async () => {
    const association = {
      slug: "ketamine",
      title: "Ketamine",
      matchedVia: "curated",
      effectSlug: "",
      effectName: "Ketamine",
      excluded: false,
      curatedPosition: 2,
    };
    convexMocks.mutation.mockResolvedValue({ association });
    const { PATCH } = await import("./route");

    const response = await PATCH(
      patchRequest({ substanceSlug: "ketamine", assigned: true }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, association });
    expect(convexMocks.mutation).toHaveBeenCalledWith(
      "substanceGalleries.setReplicationDirectAssociation",
      {
        apiKey: "admin-key",
        actorEmail: "editor@example.com",
        replicationSlug: "tracers-hand",
        substanceSlug: "ketamine",
        assigned: true,
      },
    );
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(
      "public-replications",
      { expire: 0 },
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/ketamine");
  });

  it("rejects a malformed direct-association payload before Convex", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      patchRequest({ substanceSlug: "Ketamine", assigned: "yes" }),
    );
    expect(response.status).toBe(400);
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });
});

describe("replication associations POST", () => {
  it("adds an exclusion, then revalidates the tag and the written article", async () => {
    convexMocks.mutation.mockResolvedValue({ updated: ["lsd"], droppedCuratedPositions: [] });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ excludedSubstanceSlugs: ["lsd"] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      updated: ["lsd"],
      droppedCuratedPositions: [],
    });
    expect(convexMocks.mutation).toHaveBeenCalledWith(
      "substanceGalleries.setReplicationExclusions",
      {
        apiKey: "admin-key",
        actorEmail: "editor@example.com",
        replicationSlug: "tracers-hand",
        excludedSubstanceSlugs: ["lsd"],
        updatedBy: "editor@example.com",
      },
    );
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("public-replications", { expire: 0 });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/lsd");
  });

  it("removes an exclusion by submitting the set without it", async () => {
    convexMocks.mutation.mockResolvedValue({ updated: ["dmt"], droppedCuratedPositions: [] });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ excludedSubstanceSlugs: [] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      updated: ["dmt"],
      droppedCuratedPositions: [],
    });
    expect(convexMocks.mutation.mock.calls[0][1]).toMatchObject({ excludedSubstanceSlugs: [] });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/dmt");
  });

  it("relays a dropped curated position so the editor is told the pin went", async () => {
    convexMocks.mutation.mockResolvedValue({
      updated: ["lsd"],
      droppedCuratedPositions: [{ substance_slug: "lsd", position: 2 }],
    });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ excludedSubstanceSlugs: ["lsd"] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      updated: ["lsd"],
      droppedCuratedPositions: [{ substance_slug: "lsd", position: 2 }],
    });
  });

  it("collapses duplicate slugs rather than refusing the save", async () => {
    convexMocks.mutation.mockResolvedValue({ updated: [], droppedCuratedPositions: [] });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ excludedSubstanceSlugs: ["lsd", "lsd"] }));

    expect(response.status).toBe(200);
    expect(convexMocks.mutation.mock.calls[0][1]).toMatchObject({
      excludedSubstanceSlugs: ["lsd"],
    });
  });

  it("revalidates nothing when the save wrote nothing", async () => {
    convexMocks.mutation.mockResolvedValue({ updated: [], droppedCuratedPositions: [] });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ excludedSubstanceSlugs: [] }));

    expect(response.status).toBe(200);
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed slug list before reaching Convex", async () => {
    const { POST } = await import("./route");

    const missing = await POST(saveRequest({}));
    const notASlug = await POST(saveRequest({ excludedSubstanceSlugs: ["Not A Slug"] }));
    const notStrings = await POST(saveRequest({ excludedSubstanceSlugs: [17] }));
    const tooMany = await POST(
      saveRequest({
        excludedSubstanceSlugs: Array.from({ length: 251 }, (_, index) => `drug-${index}`),
      }),
    );

    expect(missing.status).toBe(400);
    expect(notASlug.status).toBe(400);
    expect(notStrings.status).toBe(400);
    expect(tooMany.status).toBe(400);
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });
});
