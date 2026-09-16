import { describe, expect, it } from "vitest";

import { replicationTaxonomyLocatorMatches } from "../../server/lib/replicationTaxonomyCas";

const R2_KEY = "media/sha256/ab/ab00000000000000000000000000000000000000000000000000000000000000.webp";

describe("replicationTaxonomyLocatorMatches", () => {
  it("accepts an unchanged R2-only row", () => {
    expect(replicationTaxonomyLocatorMatches(
      { r2_key: R2_KEY },
      { storage_id: null, r2_key: R2_KEY, url: null },
    )).toBe(true);
  });

  it("rejects R2 drift and locator-free snapshots", () => {
    expect(replicationTaxonomyLocatorMatches(
      { r2_key: R2_KEY },
      { storage_id: null, r2_key: R2_KEY.replace("ab/", "ac/"), url: null },
    )).toBe(false);
    expect(replicationTaxonomyLocatorMatches(
      {},
      { storage_id: null, r2_key: null, url: null },
    )).toBe(false);
  });
});
