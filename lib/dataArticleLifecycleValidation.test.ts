import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "../src/data/schema/defaults.generated";
import { referenceSchema } from "../src/schema/substance/shared";
import { validateArticleChange } from "../server/lib/articleLifecycleValidation";

function fixture() {
  const empty = createEmptyArticle();
  return {
    ...empty,
    harm_potential: empty.harm_potential,
    id: 1,
    slug: "fixture",
    title: "Fixture",
  };
}

describe("country citation validation boundaries", () => {
  function countryFixture() {
    return {
      ...fixture(),
      references: [
        referenceSchema.parse({ id: "medical", title: "Chemical identity", url: "https://example.org/chemical", sourceType: "medical_database" }),
        referenceSchema.parse({ id: "law", title: "Act", url: "https://example.gov/act", sourceType: "government_or_regulatory" }),
      ],
      legality: {
        international: [],
        countries: {
          Example: { status: "Illegal", canonicalStatus: "prohibited" as const, notes: "Chemical identity [cite:medical].", instrument: "Act [cite:law]." },
        },
      },
    };
  }

  it("accepts a changed instrument that cites a legal source", () => {
    const before = countryFixture();
    const instrument = "Act, section 4 [cite:law].";
    const after = validateArticleChange(before, {
      ...before,
      legality: { ...before.legality, countries: { Example: { ...before.legality.countries.Example, instrument } } },
    });
    expect(after.legality?.countries.Example).toEqual({ ...before.legality.countries.Example, instrument });
  });

  it("requires legal sources for changed notes", () => {
    const before = countryFixture();
    expect(() => validateArticleChange(before, {
      ...before,
      legality: { ...before.legality, countries: { Example: { ...before.legality.countries.Example, notes: "A new legal claim [cite:medical]." } } },
    })).toThrow();
  });

  it("requires legal sources for a changed instrument", () => {
    const before = countryFixture();
    expect(() => validateArticleChange(before, {
      ...before,
      legality: { ...before.legality, countries: { Example: { ...before.legality.countries.Example, instrument: "Act [cite:medical]." } } },
    })).toThrow();
  });

  it("rechecks existing citation fields when legal status changes", () => {
    const before = countryFixture();
    expect(() => validateArticleChange(before, {
      ...before,
      legality: { ...before.legality, countries: { Example: { ...before.legality.countries.Example, status: "Legal (regulated)", canonicalStatus: "legal_regulated" } } },
    })).toThrow();
  });
});
