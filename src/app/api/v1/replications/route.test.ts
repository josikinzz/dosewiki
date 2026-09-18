import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicReplications: vi.fn(),
  getPublicReplicationsBySlugs: vi.fn(),
  enforceRateLimit: vi.fn(),
}));
vi.mock("@server/data/publicData", () => ({
  getPublicReplications: mocks.getPublicReplications,
  getPublicReplicationsBySlugs: mocks.getPublicReplicationsBySlugs,
}));
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
    mocks.getPublicReplicationsBySlugs.mockReset().mockResolvedValue([replication]);
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
    expect(mocks.getPublicReplicationsBySlugs).toHaveBeenCalledWith(["drifting"]);
  });

  it("serves the whole corpus when one row has no owning effect", async () => {
    // `effect_slug` is optional, and sorting on it threw inside the handler's
    // `try` — so a single effect-less row answered every request to this
    // endpoint with a 503, losing all 247 replications for every consumer.
    mocks.getPublicReplications.mockResolvedValue([
      replication,
      { ...replication, slug: "page-hero", effect_slug: undefined },
    ]);
    mocks.getPublicReplicationsBySlugs.mockResolvedValue([
      { ...replication, slug: "page-hero", effect_slug: undefined },
      replication,
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/v1/replications"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.map((item: { slug: string }) => item.slug)).toEqual(["page-hero", "drifting"]);
    // The projector drops the absent field rather than publishing a null, which
    // is why `effect_slug` is no longer a required property of the schema in
    // `openapi.json`.
    expect(body.data[0]).not.toHaveProperty("effect_slug");
  });

  it("rejects invalid filters before reading data", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/v1/replications?type=pdf"));
    expect(response.status).toBe(400);
    expect(mocks.getPublicReplications).not.toHaveBeenCalled();
  });

  it("serves an audio replication and filters on `type=audio`", async () => {
    // `type=audio` used to be a 400 and an audio row was withheld from the
    // corpus entirely. Both now hold: the kind is in the published enum, and the
    // row carries no dimensions or renditions, which the projection permits.
    const track = {
      ...replication,
      slug: "a-recording",
      title: "A recording",
      type: "audio" as const,
      format: "mp3",
      url: "https://media.example/a-recording.mp3",
    };
    mocks.getPublicReplications.mockResolvedValue([replication, track]);
    mocks.getPublicReplicationsBySlugs.mockResolvedValue([track]);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://dose.wiki/api/v1/replications?type=audio"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meta.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      slug: "a-recording",
      type: "audio",
      url: "https://media.example/a-recording.mp3",
    });
  });

  it("traverses 6,733 rows in stable 100-row partitions without omissions", async () => {
    const corpus = Array.from({ length: 6_733 }, (_, index) => ({
      ...replication,
      _id: `id-${index}`,
      slug: `work-${String(index).padStart(4, "0")}`,
      title: `Work ${index}`,
      type: index % 2 === 0 ? ("video" as const) : ("image" as const),
    }));
    const bySlug = new Map(corpus.map((item) => [item.slug, item]));
    mocks.getPublicReplications.mockResolvedValue(corpus);
    mocks.getPublicReplicationsBySlugs.mockImplementation(async (slugs: string[]) =>
      slugs.flatMap((slug) => {
        const item = bySlug.get(slug);
        return item ? [item] : [];
      }),
    );
    const { GET } = await import("./route");
    const seen: string[] = [];
    const pageSizes: number[] = [];
    let cursor: string | null = null;

    do {
      const url = new URL("https://dose.wiki/api/v1/replications");
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await GET(new Request(url));
      const body = await response.json();
      pageSizes.push(body.data.length);
      seen.push(...body.data.map((item: { slug: string }) => item.slug));
      cursor = body.pagination.next_cursor;
    } while (cursor);

    expect(pageSizes).toEqual([...Array(67).fill(100), 33]);
    expect(seen).toHaveLength(6_733);
    expect(new Set(seen).size).toBe(6_733);
    expect(mocks.getPublicReplicationsBySlugs).toHaveBeenCalledTimes(68);
  });
});
