import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  getPublicGalleryReplications: vi.fn(),
  getPublicContributorDirectory: vi.fn(),
}));

vi.mock("@server/convex/publicData", () => ({
  getPublicGalleryReplications: mocks.getPublicGalleryReplications,
  getPublicContributorDirectory: mocks.getPublicContributorDirectory,
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

// One entry per credited artist in the corpus. The index page inlines only the
// entries its prerendered rails consult, so this response is where the rest of
// the artists' identities reach the client.
const directory = [
  { key: "ARTIST", displayName: "Artist", aliases: ["artist"] },
];

describe("replication gallery corpus", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.getPublicGalleryReplications.mockReset().mockResolvedValue([preview]);
    mocks.getPublicContributorDirectory.mockReset().mockResolvedValue(directory);
  });

  it("returns the complete slim corpus in one cached response", async () => {
    const response = await GET(
      new Request("https://dose.wiki/api/replications/gallery"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    );
    await expect(response.json()).resolves.toEqual({
      data: [preview],
      contributorDirectory: directory,
    });
    expect(mocks.getPublicGalleryReplications).toHaveBeenCalledTimes(1);
  });

  it("enforces the public content read limit before loading gallery data", async () => {
    const rateLimited = new Response("Too many requests", { status: 429 });
    mocks.enforceRateLimit.mockResolvedValueOnce(rateLimited);

    const response = await GET(
      new Request("https://dose.wiki/api/replications/gallery"),
    );

    expect(mocks.getPublicGalleryReplications).not.toHaveBeenCalled();
    expect(response).toBe(rateLimited);
  });

  it("does not cache a failed gallery read", async () => {
    mocks.getPublicGalleryReplications.mockRejectedValueOnce(
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
