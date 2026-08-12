import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const { EFFECT_INDEX_FEATURED_REPLICATION_SLUGS, resolveFeaturedReplicationSlugs } = await import(
  "./effectIndexHome"
);

/**
 * The featured carousel moved from a checked-in list to a Convex document, and
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
});
