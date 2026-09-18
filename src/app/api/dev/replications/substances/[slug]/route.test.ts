import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeRoleFloor,
  installProtectedRouteMocks,
  resetRouteMocks,
  routeMocks,
  signInAs,
} from "@/test/routeHarness";

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    substanceGalleries: {
      getCurationDetail: "substanceGalleries.getCurationDetail",
      upsert: "substanceGalleries.upsert",
    },
  },
}));

const publishMocks = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
}));

installProtectedRouteMocks();

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
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  // The publish spy lives outside the route harness and accumulates across cases.
  vi.clearAllMocks();
  resetRouteMocks("admin", { email: "admin@example.com", name: "Admin" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("substance gallery route auth", () => {
  it("lets an editor read the detail but refuses the save with 403 before Postgres", async () => {
    signInAs("editor");
    routeMocks.query.mockResolvedValue(DETAIL);
    const { GET, POST } = await import("./route");

    const read = await GET(new Request("https://dose.wiki/api/dev/replications/substances/lsd"));
    const write = await POST(saveRequest({ curatedSlugs: ["tracers-hand"], removedSlugs: [] }));

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(routeMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(routeMocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });
});

describe("substance gallery GET", () => {
  it("returns the detail payload for a known substance", async () => {
    routeMocks.query.mockResolvedValue(DETAIL);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/replications/substances/lsd"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ...DETAIL });
    expect(routeMocks.query).toHaveBeenCalledWith("substanceGalleries.getCurationDetail", {
      apiKey: "admin-key",
      substance_slug: "lsd",
    });
  });

  it("maps a null detail to a 404", async () => {
    routeMocks.query.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/dev/replications/substances/no-such-drug"),
    );

    expect(response.status).toBe(404);
  });

  it("refuses a slug shape no substance has without calling Postgres", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/dev/replications/substances/Not%20A%20Slug!"),
    );

    expect(response.status).toBe(404);
    expect(routeMocks.query).not.toHaveBeenCalled();
  });
});

describe("substance gallery POST", () => {
  it("submits full arrays, publishes, and returns the pruned echo verbatim", async () => {
    routeMocks.mutation.mockResolvedValue({
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
    expect(routeMocks.mutation).toHaveBeenCalledWith("substanceGalleries.upsert", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      substance_slug: "lsd",
      curated_slugs: ["tracers-hand", "ghost-row"],
      removed_slugs: ["haze-room"],
      updatedBy: "admin@example.com",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "article", slug: "lsd" }, { kind: "replication-collections" }],
      source: "manual",
    });
  });

  it("rejects a curated∩excluded overlap before reaching Postgres", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({ curatedSlugs: ["tracers-hand"], removedSlugs: ["tracers-hand"] }),
    );

    expect(response.status).toBe(400);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });

  it("accepts the legacy underscore slugs the corpus actually holds", async () => {
    routeMocks.mutation.mockResolvedValue({
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
    expect(routeMocks.mutation).toHaveBeenCalledTimes(1);
  });

  it("rejects a body without both arrays", async () => {
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ curatedSlugs: ["tracers-hand"] }));

    expect(response.status).toBe(400);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects a non-slug entry", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({ curatedSlugs: ["Not A Slug"], removedSlugs: [] }),
    );

    expect(response.status).toBe(400);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });


  it("rejects a non-string, non-null expectedUpdatedAt before reaching Postgres", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      saveRequest({ curatedSlugs: [], removedSlugs: [], expectedUpdatedAt: 17 }),
    );

    expect(response.status).toBe(400);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });

  it("reports a stale save as a 409 with the server state and publishes nothing", async () => {
    routeMocks.mutation.mockResolvedValue({
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
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });
});

describeRoleFloor({
  floor: "editor",
  rateLimit: "diagnosticRead",
  refused: "contributor",
  calls: [
    {
      name: "GET",
      call: async () =>
        (await import("./route")).GET(
          new Request("https://dose.wiki/api/dev/replications/substances/lsd"),
        ),
    },
  ],
});

describeRoleFloor({
  floor: "admin",
  rateLimit: "editorSmallWrite",
  refused: "editor",
  calls: [
    {
      name: "POST",
      call: async () =>
        (await import("./route")).POST(saveRequest({ curatedSlugs: [], removedSlugs: [] })),
    },
  ],
});
