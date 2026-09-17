import { describe, expect, it } from "vitest";
import featuredReplications from "@data/effects/effectIndexFeaturedReplications.json";
import replicationSlugAliases from "@data/effects/replicationSlugAliases.json";

/**
 * The featured list names replication slugs, and slugs move.
 *
 * When the artist identities were consolidated, thirty of these thirty-six
 * entries were renamed out from under this file. Nothing failed: the resolver
 * looks each slug up with `bySlug.get(slug)` and a miss returns an empty array,
 * so the Effect Index homepage quietly ran on six curated replications instead
 * of thirty-six until somebody counted.
 *
 * The alias map is the record of every rename, so a featured slug appearing as a
 * *key* in it is exactly the signal that this file is out of date — checkable
 * with no network and no database.
 */
describe("Effect Index featured replications", () => {
  const aliases = replicationSlugAliases as Record<string, string>;
  const slugs = featuredReplications.slugs;

  it("names slugs that have not since been renamed", () => {
    const stale = slugs
      .filter((slug) => aliases[slug])
      .map((slug) => `${slug} -> ${aliases[slug]}`);

    expect(
      stale,
      "These featured slugs have been renamed. Repoint them at their current " +
        "names, or the homepage silently drops them:\n  " + stale.join("\n  "),
    ).toEqual([]);
  });

  it("curates each replication once", () => {
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("is not empty, which would leave the homepage panel blank", () => {
    expect(slugs.length).toBeGreaterThan(0);
  });
});
