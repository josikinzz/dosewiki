import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPublicReplications: vi.fn(), enforceRateLimit: vi.fn() }));
vi.mock("@server/convex/publicData", () => ({ getPublicReplications: mocks.getPublicReplications }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

const replication = {
  _id: "private-id", _creationTime: 1, storage_id: "private-storage", permission_notes: "private",
  removal_contact: "private@example.com", slug: "drifting", title: "Drifting", artist: "Artist",
  type: "video" as const, effect_slug: "visual-drifting", format: "mp4", created_at: "2026-01-01",
  url: "https://media.example/drifting.mp4", rights_status: "permission-granted" as const,
};

describe("public replications API", () => {
  beforeEach(() => {
    mocks.getPublicReplications.mockReset().mockResolvedValue([replication]);
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  });

  it("filters and paginates sanitized public media", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/v1/replications?effect=visual-drifting&type=video"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({ slug: "drifting", rights: { status: "permission-granted" } });
    expect(JSON.stringify(body)).not.toContain("private-storage");
    expect(JSON.stringify(body)).not.toContain("private@example.com");
  });

  it("rejects invalid filters before reading data", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/v1/replications?type=audio"));
    expect(response.status).toBe(400);
    expect(mocks.getPublicReplications).not.toHaveBeenCalled();
  });
});
