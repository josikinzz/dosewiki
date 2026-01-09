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
