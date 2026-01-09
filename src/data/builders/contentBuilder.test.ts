import { describe, it, expect, vi } from 'vitest';
import { buildSubstanceRecord } from './contentBuilder';
import { minimalArticle, fullArticleWithDosage, hiddenArticle } from '@/test/fixtures/articles';
import { createEmptyArticle } from '@/data/schema/defaults.generated';

vi.mock('@/data/mappings/moleculeSvgMappings.json', () => ({
  default: { mappings: [] },
}));

describe('buildSubstanceRecord', () => {
  describe('basic transformation', () => {
    it('transforms minimal article to SubstanceRecord', () => {
      const result = buildSubstanceRecord(minimalArticle);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
      expect(result?.name).toBe('Test Substance');
      expect(result?.slug).toBe('test-substance');
      expect(result?.isHidden).toBe(false);
    });

    it('returns null for empty article', () => {
      const empty = createEmptyArticle();
      const result = buildSubstanceRecord(empty);

      expect(result).toBeNull();
    });

    it('detects hidden articles', () => {
      const result = buildSubstanceRecord(hiddenArticle);

      expect(result?.isHidden).toBe(true);
    });
  });

  describe('dosage transformation', () => {
    it('transforms dose ranges correctly', () => {
      const result = buildSubstanceRecord(fullArticleWithDosage);
      const route = result?.content.routes['sublingual'];

      expect(route).toBeDefined();
      expect(route?.dosage).toHaveLength(5); // threshold through heavy

      // Check threshold (min only)
      expect(route?.dosage[0]).toEqual({
        label: 'Threshold',
        value: '15+ μg',
      });

      // Check moderate (range)
      expect(route?.dosage[2]).toEqual({
        label: 'Moderate',
        value: '75-150 μg',
      });
    });

    it('transforms duration stages correctly', () => {
      const result = buildSubstanceRecord(fullArticleWithDosage);
      const route = result?.content.routes['sublingual'];

      expect(route?.duration).toHaveLength(6); // all stages
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

      expect(interactions).toHaveLength(2); // danger + caution (unsafe is empty)

      const danger = interactions?.find(g => g.severity === 'danger');
      expect(danger?.items).toHaveLength(2);
      expect(danger?.items[0].display).toBe('Lithium');
    });

    it('handles empty interactions', () => {
      const result = buildSubstanceRecord(minimalArticle);
      expect(result?.content.interactions).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles null id', () => {
      const withNullId = { ...minimalArticle, id: null };
      const result = buildSubstanceRecord(withNullId);

      expect(result?.id).toBeNull();
    });

    it('handles missing optional fields', () => {
      const result = buildSubstanceRecord(minimalArticle);

      expect(result?.content.tolerance).toEqual([]);
      expect(result?.content.citations).toEqual([]);
    });

    it('extracts aliases from alternative_names', () => {
      const result = buildSubstanceRecord(fullArticleWithDosage);

      expect(result?.aliases).toContain('Acid');
      expect(result?.aliases).toContain('Lucy');
    });
  });
});
