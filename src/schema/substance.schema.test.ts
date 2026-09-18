import { describe, it, expect } from 'vitest';
import {
  substanceArticleSchema,
  doseRangeSchema,
  interactionsSchema,
} from './substance.schema';
import { createEmptyArticle } from '@/data/schema/defaults.generated';
import { minimalArticle } from '@/test/fixtures/articles';

describe('substanceArticleSchema', () => {
  it('validates complete article', () => {
    const result = substanceArticleSchema.safeParse(minimalArticle);
    expect(result.success).toBe(true);
  });

  it('validates empty article from createEmptyArticle()', () => {
    const emptyArticle = createEmptyArticle();
    const result = substanceArticleSchema.safeParse(emptyArticle);
    expect(result.success).toBe(true);
  });

  it('rejects article with missing required fields', () => {
    const invalid = { id: 1 };
    const result = substanceArticleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('allows null id', () => {
    const withNullId = { ...minimalArticle, id: null };
    const result = substanceArticleSchema.safeParse(withNullId);
    expect(result.success).toBe(true);
  });

  it("accepts structured references and route reference ids", () => {
    const withReferences = {
      ...minimalArticle,
      references: [
        {
          id: "pmid-12345",
          type: "journal_article",
          title: "Citation title",
          authors: ["Author One"],
          year: 2024,
          sourceType: "primary_literature",
          quality: "high",
          doi: "10.1000/example",
        },
      ],
      dosage: {
        ...minimalArticle.dosage,
        routes: [
          {
            route: "Oral",
            bioavailability: "",
            bioavailability_notes: "",
            dose_ranges: {
              threshold: { min: null, max: null, unit: "" },
              light: { min: null, max: null, unit: "" },
              moderate: { min: null, max: null, unit: "" },
              strong: { min: null, max: null, unit: "" },
              heavy: { min: null, max: null, unit: "" },
            },
            notes: "",
            reference_ids: ["pmid-12345"],
          },
        ],
      },
      duration: {
        ...minimalArticle.duration,
        routes: [
          {
            route: "Oral",
            half_life: "",
            half_life_notes: "",
            stages: {
              onset: { min: null, max: null, unit: "" },
              come_up: { min: null, max: null, unit: "" },
              peak: { min: null, max: null, unit: "" },
              offset: { min: null, max: null, unit: "" },
              after_effects: { min: null, max: null, unit: "" },
              total_duration: { min: null, max: null, unit: "" },
            },
            reference_ids: ["pmid-12345"],
          },
        ],
      },
    };

    expect(substanceArticleSchema.safeParse(withReferences).success).toBe(true);
  });

  it("rejects invalid structured reference enums", () => {
    const invalidReference = {
      ...minimalArticle,
      references: [
        {
          id: "bad-ref",
          type: "unsupported",
          title: "Bad ref",
          authors: [],
          sourceType: "not-real",
          quality: "broken",
        },
      ],
    };

    expect(substanceArticleSchema.safeParse(invalidReference).success).toBe(false);
  });
});

describe('doseRangeSchema', () => {
  it('validates complete dose range', () => {
    const result = doseRangeSchema.safeParse({ min: 10, max: 20, unit: 'mg' });
    expect(result.success).toBe(true);
  });

  it('allows null min (max only)', () => {
    const result = doseRangeSchema.safeParse({ min: null, max: 20, unit: 'mg' });
    expect(result.success).toBe(true);
  });

  it('allows null max (min only)', () => {
    const result = doseRangeSchema.safeParse({ min: 10, max: null, unit: 'mg' });
    expect(result.success).toBe(true);
  });

  it('requires unit to be string', () => {
    const result = doseRangeSchema.safeParse({ min: 10, max: 20, unit: 123 });
    expect(result.success).toBe(false);
  });
});

describe('interactionsSchema', () => {
  it('validates interactions with all severity levels', () => {
    const result = interactionsSchema.safeParse({
      dangerous: ['Lithium'],
      unsafe: ['MAOI'],
      caution: ['Cannabis'],
    });
    expect(result.success).toBe(true);
  });

  it('allows empty arrays', () => {
    const result = interactionsSchema.safeParse({
      dangerous: [],
      unsafe: [],
      caution: [],
    });
    expect(result.success).toBe(true);
  });
});
