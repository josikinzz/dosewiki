import { describe, expect, it } from "vitest";
import {
  CATEGORY_SLUG_TO_TAGS,
  effectMatchesCategorySlug,
  getEffectCategoryDefinition,
} from "./effectCategoryDefinitions";

describe("effect category definitions", () => {
  it("matches specific category pages with AND semantics", () => {
    expect(
      effectMatchesCategorySlug(
        { tags: ["visual", "amplification"] },
        "visual-amplifications",
      ),
    ).toBe(true);
    expect(
      effectMatchesCategorySlug(
        { tags: ["visual", "suppression"] },
        "visual-amplifications",
      ),
    ).toBe(false);
  });

  it("matches broad category pages with OR tag groups when needed", () => {
    expect(
      effectMatchesCategorySlug(
        { tags: ["gustatory"] },
        "smell-and-taste-effects",
      ),
    ).toBe(true);
    expect(
      effectMatchesCategorySlug(
        { tags: ["olfactory"] },
        "smell-and-taste-effects",
      ),
    ).toBe(true);
  });

  it("keeps the flattened tag map available for page display fallbacks", () => {
    expect(CATEGORY_SLUG_TO_TAGS["visual-amplifications"]).toEqual([
      "visual",
      "amplification",
    ]);
  });

  it("keeps transpersonal effect and state categories distinct", () => {
    expect(getEffectCategoryDefinition("transpersonal-effects")?.name).toBe(
      "Transpersonal Effects",
    );
    expect(CATEGORY_SLUG_TO_TAGS["transpersonal-effects"]).toEqual([
      "transpersonal state",
    ]);
    expect(
      effectMatchesCategorySlug(
        { tags: ["transpersonal state"] },
        "transpersonal-effects",
      ),
    ).toBe(true);
  });
});
