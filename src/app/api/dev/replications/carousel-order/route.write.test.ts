import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../convex/_generated/api", () => ({
  api: {
    replications: { updateGalleryOrder: "replications.updateGalleryOrder" },
    substanceGalleries: {
      getBySubstance: "substanceGalleries.getBySubstance",
      setCarouselOrder: "substanceGalleries.setCarouselOrder",
    },
    subjectiveEffects: { getBySlug: "subjectiveEffects.getBySlug" },
    contributorProfiles: {
      getByKey: "contributorProfiles.getByKey",
      setContributorOrdering: "contributorProfiles.setContributorOrdering",
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

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
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

function orderRequest(body: unknown) {
  return new Request(
    "https://dosewiki-admin.vercel.app/api/dev/replications/carousel-order",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
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
  convexMocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: convexMocks.query, mutation: convexMocks.mutation },
      adminKey: "admin-key",
    },
  });
  convexMocks.mutation.mockResolvedValue({ status: "ok" });
});

describe("carousel order PATCH", () => {
  it("refuses an anonymous request before Convex", async () => {
    authMocks.requireRoleSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Editor session required." }, { status: 401 }),
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      orderRequest({ targetKind: "effect", targetKey: "tracers", slugs: [] }),
    );
    expect(response.status).toBe(401);
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses an editor with 403 before Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { PATCH } = await import("./route");
    const response = await PATCH(
      orderRequest({ targetKind: "effect", targetKey: "tracers", slugs: ["still"] }),
    );
    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(convexMocks.mutation).not.toHaveBeenCalled();
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("writes an effect gallery order with a stale-write baseline", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      orderRequest({
        targetKind: "effect",
        targetKey: "tracers",
        slugs: ["still", "video"],
        expectedOrder: ["video", "still"],
      }),
    );


    expect(response.status).toBe(200);
    expect(convexMocks.mutation).toHaveBeenCalledWith(
      "replications.updateGalleryOrder",
      {
        apiKey: "admin-key",
        actorEmail: "admin@example.com",
        effect_slug: "tracers",
        replication_slugs: ["still", "video"],
        expected_replication_slugs: ["video", "still"],
      },
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/effects/tracers");
  });
  it("fails closed on a public host before Convex", async () => {
    authMocks.requireRoleSession.mockRejectedValue(
      new Error("Effect Index has no editor auth configuration."),
    );
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("https://dose.wiki/api/dev/replications/carousel-order", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetKind: "effect",
          targetKey: "tracers",
          slugs: [],
        }),
      }),
    );
    expect(response.status).toBe(404);
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  it("writes artist and substance orders through their owning records", async () => {
    const { PATCH } = await import("./route");
    await PATCH(
      orderRequest({
        targetKind: "artist",
        targetKey: "chelsea-morgan",
        slugs: ["a", "b"],
        expectedOrder: ["b", "a"],
      }),
    );
    expect(convexMocks.mutation).toHaveBeenNthCalledWith(
      1,
      "contributorProfiles.setContributorOrdering",
      expect.objectContaining({
        key: "chelsea-morgan",
        replicationOrder: ["a", "b"],
        expectedReplicationOrder: ["b", "a"],
      }),
    );

    await PATCH(
      orderRequest({
        targetKind: "substance",
        targetKey: "ketamine",
        slugs: ["x", "y"],
        expectedOrder: ["y", "x"],
        expectedUpdatedAt: "2026-08-25T10:00:00.000Z",
      }),
    );
    expect(convexMocks.mutation).toHaveBeenNthCalledWith(
      2,
      "substanceGalleries.setCarouselOrder",
      expect.objectContaining({
        substance_slug: "ketamine",
        carousel_order: ["x", "y"],
        expectedCarouselOrder: ["y", "x"],
        expectedUpdatedAt: "2026-08-25T10:00:00.000Z",
      }),
    );
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(
      "public-replications",
      { expire: 0 },
    );
  });
});
