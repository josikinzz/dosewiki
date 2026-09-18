import { describe, expect, it, vi } from "vitest";

const publicData = vi.hoisted(() => ({
  getPublicEffects: vi.fn(async () => []),
  getPublicFeaturedReplicationSlugs: vi.fn(async () => ["featured-work"]),
  getPublicReplications: vi.fn(async () => []),
  getPublicReplicationsBySlugs: vi.fn(async () => [
    {
      _id: "featured-id",
      slug: "featured-work",
      title: "Featured work",
      artist: "Artist",
      type: "image",
      format: "webp",
      created_at: "2026-01-01",
      url: "https://media.test/featured.webp",
    },
  ]),
  getPublicReports: vi.fn(async () => []),
  getPublishedPublicationIndex: vi.fn(async () => []),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@server/data/publicData", () => publicData);

const {
  EFFECT_INDEX_FEATURED_REPLICATION_SLUGS,
  loadEffectIndexHomeData,
  resolveFeaturedReplicationSlugs,
} = await import("./effectIndexHome");

/**
 * The featured carousel moved from a checked-in list to a Postgres document, and
 * the whole risk of that move is in which one wins. A stored selection is an
 * editor's decision and must not be quietly overruled by the file — including
 * when they cleared it, which is a decision to feature nothing.
 */
describe("featured replication slug precedence", () => {
  it("runs on the checked-in list until something is stored", () => {
    expect(resolveFeaturedReplicationSlugs(null)).toBe(EFFECT_INDEX_FEATURED_REPLICATION_SLUGS);
    expect(EFFECT_INDEX_FEATURED_REPLICATION_SLUGS.length).toBeGreaterThan(0);
  });

  it("prefers a stored selection over the checked-in list", () => {
    expect(resolveFeaturedReplicationSlugs(["one", "two"])).toEqual(["one", "two"]);
  });

  it("treats a stored empty selection as 'feature nothing', not as 'never curated'", () => {
    expect(resolveFeaturedReplicationSlugs([])).toEqual([]);
  });

  it("hydrates only the curated replication slugs through indexed reads", async () => {
    await loadEffectIndexHomeData(7);

    expect(publicData.getPublicReplicationsBySlugs).toHaveBeenCalledWith([
      "featured-work",
    ]);
    expect(publicData.getPublicReplications).not.toHaveBeenCalled();
  });
});
