import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    substanceGalleries: {
      getReplicationAssociationsPage: "substanceGalleries.getReplicationAssociationsPage",
      setReplicationExclusions: "substanceGalleries.setReplicationExclusions",
      setReplicationDirectAssociation:
        "substanceGalleries.setReplicationDirectAssociation",
    },
  },
}));

const publishMocks = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
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
  mutation: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: dataMocks.getServerDataWriteCapability,
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
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown, slug = "tracers-hand") {
  return new Request(
    `https://dosewiki-admin.vercel.app/api/dev/replications/associations/${slug}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: "https://dosewiki-admin.vercel.app" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockImplementation(
    roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
  );
  dataMocks.getServerDataWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: dataMocks.query, mutation: dataMocks.mutation },
      adminKey: "admin-key",
    },
  });
});

describe("replication associations route auth", () => {
  it("refuses a non-editor before touching Postgres, on both verbs", async () => {
    authMocks.requireRoleSession.mockResolvedValue({
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
    expect(dataMocks.query).not.toHaveBeenCalled();
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  it("lets an editor read but refuses both writes with 403 before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    dataMocks.query.mockResolvedValue({ items: [], cursor: "", isDone: true });
    const { GET, PATCH, POST } = await import("./route");

    const read = await GET(readRequest());
    const patch = await PATCH(patchRequest({ substanceSlug: "lsd", assigned: true }));
    const write = await POST(saveRequest({ excludedSubstanceSlugs: ["lsd"] }));

    expect(read.status).toBe(200);
    expect(patch.status).toBe(403);
    expect(write.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("editor");
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(dataMocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });
});

describe("replication associations GET", () => {
  it("drains the cursor and returns the rows sorted by substance title", async () => {
    dataMocks.query
      .mockResolvedValueOnce({ items: [TRACERS_LSD], cursor: "page-2", isDone: false })
      .mockResolvedValueOnce({ items: [TRACERS_DMT], cursor: "end", isDone: true });
    const { GET } = await import("./route");

    const response = await GET(readRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      associations: [TRACERS_DMT, TRACERS_LSD],
    });
    expect(dataMocks.query).toHaveBeenCalledTimes(2);
    expect(dataMocks.query).toHaveBeenNthCalledWith(
      1,
      "substanceGalleries.getReplicationAssociationsPage",
      { apiKey: "admin-key", replicationSlug: "tracers-hand", cursor: undefined, limit: 100 },
    );
    expect(dataMocks.query).toHaveBeenNthCalledWith(
      2,
      "substanceGalleries.getReplicationAssociationsPage",
      { apiKey: "admin-key", replicationSlug: "tracers-hand", cursor: "page-2", limit: 100 },
    );
  });

  it("answers an empty list for a replication on no article", async () => {
    dataMocks.query.mockResolvedValue({ items: [], cursor: "", isDone: true });
    const { GET } = await import("./route");

    const response = await GET(readRequest("clinical-figure-1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, associations: [] });
  });

  it("drops both copies of a slug stored on two articles", async () => {
    dataMocks.query.mockResolvedValue({
      items: [TRACERS_LSD, TRACERS_DMT, { ...TRACERS_LSD, title: "LSD (duplicate)" }],
      cursor: "end",
      isDone: true,
    });
    const { GET } = await import("./route");

    const response = await GET(readRequest());

    expect(await response.json()).toEqual({ ok: true, associations: [TRACERS_DMT] });
  });

  it("refuses a slug shape no replication has without calling Postgres", async () => {
    const { GET } = await import("./route");

    const response = await GET(readRequest("Not%20A%20Slug!"));

    expect(response.status).toBe(404);
    expect(dataMocks.query).not.toHaveBeenCalled();
  });
});

describe("replication associations PATCH", () => {
  it("assigns one replication directly and publishes its article", async () => {
    const association = {
      slug: "ketamine",
      title: "Ketamine",
      matchedVia: "curated",
      effectSlug: "",
      effectName: "Ketamine",
      excluded: false,
      curatedPosition: 2,
    };
    dataMocks.mutation.mockResolvedValue({ association });
    const { PATCH } = await import("./route");

    const response = await PATCH(
      patchRequest({ substanceSlug: "ketamine", assigned: true }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, association });
    expect(dataMocks.mutation).toHaveBeenCalledWith(
      "substanceGalleries.setReplicationDirectAssociation",
      {
        apiKey: "admin-key",
        actorEmail: "admin@example.com",
        replicationSlug: "tracers-hand",
        substanceSlug: "ketamine",
        assigned: true,
      },
    );
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "article", slug: "ketamine" }, { kind: "replication-collections" }],
      source: "manual",
    });
  });

  it("rejects a malformed direct-association payload before Postgres", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      patchRequest({ substanceSlug: "Ketamine", assigned: "yes" }),
    );
    expect(response.status).toBe(400);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });
});

describe("replication associations POST", () => {
  it("adds an exclusion, then publishes the written article", async () => {
    dataMocks.mutation.mockResolvedValue({ updated: ["lsd"], droppedCuratedPositions: [] });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ excludedSubstanceSlugs: ["lsd"] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      updated: ["lsd"],
      droppedCuratedPositions: [],
    });
    expect(dataMocks.mutation).toHaveBeenCalledWith(
      "substanceGalleries.setReplicationExclusions",
      {
        apiKey: "admin-key",
        actorEmail: "admin@example.com",
        replicationSlug: "tracers-hand",
        excludedSubstanceSlugs: ["lsd"],
        updatedBy: "admin@example.com",
      },
    );
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "replication-collections" }, { kind: "article", slug: "lsd" }],
      source: "manual",
    });
  });

  it("removes an exclusion by submitting the set without it", async () => {
    dataMocks.mutation.mockResolvedValue({ updated: ["dmt"], droppedCuratedPositions: [] });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ excludedSubstanceSlugs: [] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      updated: ["dmt"],
      droppedCuratedPositions: [],
    });
    expect(dataMocks.mutation.mock.calls[0][1]).toMatchObject({ excludedSubstanceSlugs: [] });
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "replication-collections" }, { kind: "article", slug: "dmt" }],
      source: "manual",
    });
  });

  it("relays a dropped curated position so the editor is told the pin went", async () => {
    dataMocks.mutation.mockResolvedValue({
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
    dataMocks.mutation.mockResolvedValue({ updated: [], droppedCuratedPositions: [] });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ excludedSubstanceSlugs: ["lsd", "lsd"] }));

    expect(response.status).toBe(200);
    expect(dataMocks.mutation.mock.calls[0][1]).toMatchObject({
      excludedSubstanceSlugs: ["lsd"],
    });
  });

  it("publishes nothing when the save wrote nothing", async () => {
    dataMocks.mutation.mockResolvedValue({ updated: [], droppedCuratedPositions: [] });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ excludedSubstanceSlugs: [] }));

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("rejects a malformed slug list before reaching Postgres", async () => {
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
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });
});
