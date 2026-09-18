import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
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

const publishMocks = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));
vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
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

function orderRequest(body: unknown) {
  return new Request(
    "https://dosewiki-admin.vercel.app/api/dev/replications/carousel-order",
    {
      method: "PATCH",
      headers: { "content-type": "application/json", Origin: "https://dosewiki-admin.vercel.app" },
      body: JSON.stringify({ expectedRevision: "a".repeat(64), ...(body as Record<string, unknown>) }),
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
  dataMocks.mutation.mockResolvedValue({ status: "ok" });
});

describe("carousel order PATCH", () => {
  it("refuses an anonymous request before Postgres", async () => {
    authMocks.requireRoleSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Editor session required." }, { status: 401 }),
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      orderRequest({ targetKind: "effect", targetKey: "tracers", slugs: [] }),
    );
    expect(response.status).toBe(401);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses an editor with 403 before Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { PATCH } = await import("./route");
    const response = await PATCH(
      orderRequest({ targetKind: "effect", targetKey: "tracers", slugs: ["still"] }),
    );
    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(dataMocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
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
    expect(dataMocks.mutation).toHaveBeenCalledWith(
      "replications.updateGalleryOrder",
      {
        apiKey: "admin-key",
        actorEmail: "admin@example.com",
        effect_slug: "tracers",
        replication_slugs: ["still", "video"],
        expected_replication_slugs: ["video", "still"],
        expectedRevision: "a".repeat(64),
      },
    );
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "effect", slug: "tracers" }, { kind: "replication-collections" }],
      source: "manual",
    });
  });
  it("fails closed on a public host before Postgres", async () => {
    authMocks.requireRoleSession.mockRejectedValue(
      new Error("Effect Index has no editor auth configuration."),
    );
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("https://dose.wiki/api/dev/replications/carousel-order", {
        method: "PATCH",
        headers: { "content-type": "application/json", Origin: "https://dose.wiki" },
        body: JSON.stringify({
          targetKind: "effect",
          targetKey: "tracers",
          slugs: [],
        }),
      }),
    );
    expect(response.status).toBe(404);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
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
    expect(dataMocks.mutation).toHaveBeenNthCalledWith(
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
    expect(dataMocks.mutation).toHaveBeenNthCalledWith(
      2,
      "substanceGalleries.setCarouselOrder",
      expect.objectContaining({
        substance_slug: "ketamine",
        carousel_order: ["x", "y"],
        expectedCarouselOrder: ["y", "x"],
        expectedUpdatedAt: "2026-08-25T10:00:00.000Z",
      }),
    );
    expect(publishMocks.publishPublicCache).toHaveBeenNthCalledWith(1, {
      targets: [
        { kind: "contributor", slug: "chelsea-morgan" },
        { kind: "replication-collections" },
      ],
      source: "manual",
    });
    expect(publishMocks.publishPublicCache).toHaveBeenNthCalledWith(2, {
      targets: [{ kind: "article", slug: "ketamine" }, { kind: "replication-collections" }],
      source: "manual",
    });
  });
});
