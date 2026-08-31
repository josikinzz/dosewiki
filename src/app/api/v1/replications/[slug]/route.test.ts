import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicReplicationBySlug: vi.fn(),
  getPublicReplications: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@server/convex/publicData", () => ({
  getPublicReplicationBySlug: mocks.getPublicReplicationBySlug,
  getPublicReplications: mocks.getPublicReplications,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

const replication = {
  _id: "private-id",
  _creationTime: 1,
  slug: "drifting",
  title: "Drifting",
  artist: "Artist",
  type: "video" as const,
  effect_slug: "visual-drifting",
  format: "mp4",
  created_at: "2026-01-01",
  url: "https://media.example/drifting.mp4",
};

describe("public replication detail API", () => {
  beforeEach(() => {
    mocks.getPublicReplicationBySlug.mockReset().mockResolvedValue(replication);
    mocks.getPublicReplications.mockReset();
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  });

  it("uses the indexed slug read and never drains the replication catalog", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/v1/replications/drifting"), {
      params: Promise.resolve({ slug: "drifting" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.getPublicReplicationBySlug).toHaveBeenCalledWith("drifting");
    expect(mocks.getPublicReplications).not.toHaveBeenCalled();
  });
});
