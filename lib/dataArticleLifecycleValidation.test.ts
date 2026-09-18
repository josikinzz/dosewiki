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
    references: [
      referenceSchema.parse({ id: "legacy", title: "First source", url: "https://example.org/first" }),
      referenceSchema.parse({ id: "legacy", title: "Second source", url: "https://example.org/second" }),
      referenceSchema.parse({ id: "other", title: "Old title", url: "https://example.org/other" }),
    ],
  };
}

describe("article reference changes around legacy collisions", () => {
  it("preserves untouched colliding records while correcting another source", () => {
    const before = fixture();
    const references = before.references.map((ref) => ref.id === "other" ? { ...ref, title: "Corrected title" } : ref);
    const after = validateArticleChange(before, { ...before, references });
    expect(after.references?.slice(0, 2)).toEqual(before.references.slice(0, 2));
    expect(after.references?.[2].title).toBe("Corrected title");
  });

  it("rejects adding another identical copy of a legacy collision", () => {
    const before = fixture();
    expect(() => validateArticleChange(before, {
      ...before,
      references: [...before.references, { ...before.references[0] }],
    })).toThrow();
  });

  it("still rejects changing a record under an ambiguous source ID", () => {
    const before = fixture();
    expect(() => validateArticleChange(before, {
      ...before,
      references: before.references.map((ref, index) => index === 1 ? { ...ref, title: "Changed title" } : ref),
    })).toThrow();
  });

  it("allows a source ID cutover only when every article marker moves with it", () => {
    const before = { ...fixture(), summary: "A claim [cite:other]." };
    before.references[2] = referenceSchema.parse({
      ...before.references[2],
      metadataProvenance: [{ kind: "inspected", source: "original-import", fields: ["title", "url"] }],
    });
    const references = before.references.map((ref) => ref.id === "other" ? { ...ref, id: "restored" } : ref);
    const after = validateArticleChange(before, { ...before, references, summary: "A claim [cite:restored]." });
    expect(after.summary).toBe("A claim [cite:restored].");
    expect(after.references?.find((ref) => ref.url === "https://example.org/other")?.id).toBe("restored");
    expect(after.references?.find((ref) => ref.id === "restored")?.metadataProvenance).toEqual(before.references[2].metadataProvenance);
    const differentSource = validateArticleChange(before, {
      ...before,
      references: references.map((ref) => ref.id === "restored" ? { ...ref, url: "https://example.org/different" } : ref),
      summary: "A claim [cite:restored].",
    });
    expect(differentSource.references?.find((ref) => ref.id === "restored")?.metadataProvenance).not.toContainEqual(before.references[2].metadataProvenance?.[0]);
    expect(() => validateArticleChange(before, { ...before, references })).toThrow();
  });

  it("rejects retaining two canonical IDs for the same source", () => {
    const before = fixture();
    expect(() => validateArticleChange(before, {
      ...before, references: [...before.references, { ...before.references[2], id: "second-id" }],
    })).toThrow();
  });
});

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

  it("preserves unrelated source classifications when only the instrument changes", () => {
    const before = countryFixture();
    const instrument = "Act, section 4 [cite:law].";
    const after = validateArticleChange(before, {
      ...before,
      legality: { ...before.legality, countries: { Example: { ...before.legality.countries.Example, instrument } } },
    });
    expect(after.legality?.countries.Example).toEqual({ ...before.legality.countries.Example, instrument });
    expect(after.references).toEqual(before.references);
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
