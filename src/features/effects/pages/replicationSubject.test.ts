import { describe, expect, it } from 'vitest';
import { resolveEffectCategories } from './replicationSubject';

describe('resolveEffectCategories', () => {
  it('returns the categories an effect belongs to, broad before specific', () => {
    const categories = resolveEffectCategories(['visual', 'distortion']);

    expect(categories.map((category) => category.slug)).toEqual([
      'visual-effects',
      'visual-distortions',
    ]);
    expect(categories[0].name).toBe('Visual Effects');
  });

  it('honours the AND semantics of a conjunction category', () => {
    // "distortion" alone is not a visual distortion; the pairing is what makes
    // the category true, which a flat tag lookup would get wrong.
    const categories = resolveEffectCategories(['cognitive', 'distortion']);

    expect(categories.map((category) => category.slug)).not.toContain('visual-distortions');
    expect(categories.map((category) => category.slug)).toContain('cognitive-effects');
  });

  it('matches a category declared as a union of conjunctions', () => {
    expect(resolveEffectCategories(['olfactory']).map((category) => category.slug)).toEqual([
      'smell-and-taste-effects',
    ]);
  });

  it('returns nothing for tags no category claims', () => {
    expect(resolveEffectCategories(['not-a-real-tag'])).toEqual([]);
  });
});
