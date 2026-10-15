import { describe, it, expect } from 'vitest';
import { buildSubstanceRecord } from './contentBuilder';
import { fullArticleWithDosage, hiddenArticle } from '@/test/fixtures/articles';

describe('buildSubstanceRecord', () => {
  it('detects hidden articles', () => {
    const result = buildSubstanceRecord(hiddenArticle);

    expect(result?.isHidden).toBe(true);
  });

  describe('dosage transformation', () => {
    it('transforms dose ranges correctly', () => {
      const result = buildSubstanceRecord(fullArticleWithDosage);
      const route = result?.content.routes['sublingual'];

      expect(route).toBeDefined();
      expect(route?.dosage).toHaveLength(5);

      expect(route?.dosage[0]).toEqual({
        label: 'Threshold',
        value: '~15 μg',
      });

      expect(route?.dosage[2]).toEqual({
        label: 'Moderate',
        value: '75-150 μg',
      });
    });

    it('transforms duration stages correctly', () => {
      const result = buildSubstanceRecord(fullArticleWithDosage);
      const route = result?.content.routes['sublingual'];

      expect(route?.duration).toHaveLength(6);
      expect(route?.duration[0]).toEqual({
        label: 'Onset',
        value: '15-30 minutes',
      });
    });
  });

  describe('interactions transformation', () => {
    it('groups interactions by severity', () => {
      const result = buildSubstanceRecord(fullArticleWithDosage);
      const interactions = result?.content.interactions;

      expect(interactions).toHaveLength(2);

      const danger = interactions?.find(g => g.severity === 'danger');
      expect(danger?.items).toHaveLength(2);
      expect(danger?.items[0].display).toBe('Lithium');
    });
  });
});
