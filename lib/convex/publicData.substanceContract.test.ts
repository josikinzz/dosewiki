import { describe, expect, it } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import {
  parsePublicSubstanceRecord,
  parsePublicSubstanceRecords,
} from "./publicData.substanceContract";

describe("public substance article contract", () => {
  it("validates public article records and strips editor-only metadata", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      editorial_review: {
        status: "needed",
        notes: "internal",
      },
    });

    expect(result).toMatchObject({
      title: "LSD",
      slug: "lsd",
      priority: "normal",
    });
    expect(result).not.toHaveProperty("editorial_review");
  });

  it("fails closed for malformed nested public article fields", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      classification: {
        psychoactive_class: "Psychedelic",
        chemical_class: ["Lysergamide"],
      },
    });

    expect(result).toBeNull();
  });

  it("filters invalid public library records at the boundary", () => {
    expect(
      parsePublicSubstanceRecords([
        { ...fullArticleWithDosage, slug: "lsd" },
        { ...fullArticleWithDosage, slug: "broken", dosage: { routes: "invalid" } },
      ]),
    ).toEqual([expect.objectContaining({ slug: "lsd" })]);
  });
});
