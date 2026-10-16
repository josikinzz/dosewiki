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

describe("substance gallery POST", () => {
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
  refused: "editor",
  calls: [
    {
      name: "POST",
      call: async () =>
        (await import("./route")).POST(saveRequest({ curatedSlugs: [], removedSlugs: [] })),
    },
  ],
});
