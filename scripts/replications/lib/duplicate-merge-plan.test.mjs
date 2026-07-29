import { describe, expect, it } from "vitest";
import { planHighConfidenceDuplicateMerges } from "./duplicate-merge-plan.mjs";

const row = (overrides) => ({
  _id: "id",
  slug: "same-slug",
  effect_slug: "unknown",
  storage_id: "placeholder-file",
  ...overrides,
});

describe("planHighConfidenceDuplicateMerges", () => {
  it("plans the audited assigned/unknown split and transfers native storage", () => {
    const result = planHighConfidenceDuplicateMerges([
      row({ _id: "keeper", effect_slug: "geometry" }),
      row({ _id: "duplicate", storage_id: "native-file", thumbnail_storage_id: "native-thumb" }),
    ]);

    expect(result).toEqual({
      merges: [{
        slug: "same-slug",
        keeperId: "keeper",
        duplicateId: "duplicate",
        keeperEffectSlug: "geometry",
        duplicateStorageId: "native-file",
        duplicateThumbnailStorageId: "native-thumb",
      }],
      review: [],
    });
  });

  it("leaves ambiguous and already-native groups for review", () => {
    const result = planHighConfidenceDuplicateMerges([
      row({ _id: "one" }),
      row({ _id: "two", storage_id: "native-two" }),
      row({ _id: "three", effect_slug: "geometry", storage_id: "native-three" }),
    ]);

    expect(result.merges).toEqual([]);
    expect(result.review).toHaveLength(1);
  });
});
