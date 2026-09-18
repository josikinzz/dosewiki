import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicReplicationBySlug: vi.fn(),
  getPublicReplications: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@server/data/publicData", () => ({
  getPublicReplicationBySlug: mocks.getPublicReplicationBySlug,
  getPublicReplications: mocks.getPublicReplications,
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

  it("returns the versioned not-found envelope with CORS", async () => {
    mocks.getPublicReplicationBySlug.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/v1/replications/unknown"), {
      params: Promise.resolve({ slug: "unknown" }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "Replication not found." },
      meta: { api_version: "v1" },
    });
  });
});
