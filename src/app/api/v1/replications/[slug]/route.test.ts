import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicReplicationBySlug: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@server/data/publicData", () => ({
  getPublicReplicationBySlug: mocks.getPublicReplicationBySlug,
  getPublicReplications: vi.fn(),
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

const replication = {
  _id: "private-id",
  _creationTime: 1,
  storage_id: "kg2private",
  removal_contact: "artist@example.com",
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
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  });

  it("serves the public projection with CORS and without private storage fields", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/v1/replications/drifting"), {
      params: Promise.resolve({ slug: "drifting" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(body).toEqual({
      data: expect.objectContaining({ slug: "drifting", url: "https://media.example/drifting.mp4" }),
      meta: { api_version: "v1" },
    });
    for (const field of ["_id", "_creationTime", "storage_id", "removal_contact"]) {
      expect(body.data).not.toHaveProperty(field);
    }
  });
});
