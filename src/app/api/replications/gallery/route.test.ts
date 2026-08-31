import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  getPublicGalleryReplicationPage: vi.fn(),
}));

vi.mock("@server/convex/publicData", () => ({
  getPublicGalleryReplicationPage: mocks.getPublicGalleryReplicationPage,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));


const preview = {
  _id: "replication-id",
  slug: "drifting",
  title: "Drifting",
  artist: "Artist",
  type: "image" as const,
  format: "webp",
  url: "https://media.example/drifting.webp",
  created_at: "2026-01-01",
};

describe("replication gallery continuation", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.getPublicGalleryReplicationPage.mockReset().mockResolvedValue({
      items: [preview],
      cursor: "opaque-next",
      isDone: false,
    });
  });

  it("returns one cached slim page with an opaque continuation cursor", async () => {
    const response = await GET(
      new Request(
        "https://dose.wiki/api/replications/gallery?cursor=opaque-current&limit=32",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
    await expect(response.json()).resolves.toEqual({
      data: [preview],
      nextCursor: "opaque-next",
      hasMore: true,
    });
    expect(mocks.getPublicGalleryReplicationPage).toHaveBeenCalledWith(
      "opaque-current",
      32,
    );
  });

  it("enforces the public content read limit before loading gallery data", async () => {
    const request = new Request(
      "https://dose.wiki/api/replications/gallery",
    );
    const rateLimited = new Response("Too many requests", { status: 429 });
    mocks.enforceRateLimit.mockResolvedValueOnce(rateLimited);

    const response = await GET(request);

    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      request,
      "publicContentApiRead",
    );
    expect(mocks.getPublicGalleryReplicationPage).not.toHaveBeenCalled();
    expect(response).toBe(rateLimited);
  });

  it("rejects page sizes above the gallery hard cap", async () => {
    const response = await GET(
      new Request("https://dose.wiki/api/replications/gallery?limit=65"),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.getPublicGalleryReplicationPage).not.toHaveBeenCalled();
  });

  it("does not cache a failed gallery read", async () => {
    mocks.getPublicGalleryReplicationPage.mockRejectedValueOnce(
      new Error("unavailable"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(
      new Request("https://dose.wiki/api/replications/gallery"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
