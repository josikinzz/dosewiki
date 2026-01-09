import { describe, it, expect } from 'vitest';
import { viewToPath, parsePath } from './routing';
import type { AppView } from '@/types/navigation';

describe('routing', () => {
  describe('viewToPath', () => {
    it('generates correct paths for all view types', () => {
      expect(viewToPath({ type: 'substances' })).toBe('/substances');
      expect(viewToPath({ type: 'effects' })).toBe('/effects');
      expect(viewToPath({ type: 'about' })).toBe('/about');
      expect(viewToPath({ type: 'substance', slug: 'lsd' })).toBe('/lsd');
      expect(viewToPath({ type: 'category', categoryKey: 'psychedelics' })).toBe('/category/psychedelics');
    });

    it('handles mechanism with optional qualifier', () => {
      expect(viewToPath({ type: 'mechanism', mechanismSlug: '5-ht2a-agonist' }))
        .toBe('/mechanism/5-ht2a-agonist');
      expect(viewToPath({ type: 'mechanism', mechanismSlug: '5-ht2a-agonist', qualifierSlug: 'partial' }))
        .toBe('/mechanism/5-ht2a-agonist/partial');
    });

    it('handles interactions with optional slugs', () => {
      expect(viewToPath({ type: 'interactions' })).toBe('/interactions');
      expect(viewToPath({ type: 'interactions', primarySlug: 'lsd' })).toBe('/interactions/lsd');
      expect(viewToPath({ type: 'interactions', primarySlug: 'lsd', secondarySlug: 'mdma' }))
        .toBe('/interactions/lsd/mdma');
    });

    it('encodes search queries', () => {
      expect(viewToPath({ type: 'search', query: 'test query' }))
        .toBe('/search/test%20query');
    });

    it('handles dev tabs', () => {
      expect(viewToPath({ type: 'dev', tab: 'edit' })).toBe('/dev/edit');
      expect(viewToPath({ type: 'dev', tab: 'generator', slug: 'lsd' })).toBe('/dev/generator/lsd');
    });
  });

  describe('parsePath', () => {
    it('parses all standard routes', () => {
      expect(parsePath('/substances', null)).toEqual({ type: 'substances' });
      expect(parsePath('/effects', null)).toEqual({ type: 'effects' });
      expect(parsePath('/about', null)).toEqual({ type: 'about' });
    });

    it('parses substance slugs as short URLs', () => {
      expect(parsePath('/lsd', null)).toEqual({ type: 'substance', slug: 'lsd' });
      expect(parsePath('/mdma', null)).toEqual({ type: 'substance', slug: 'mdma' });
    });

    it('parses category routes', () => {
      expect(parsePath('/category/psychedelics', null))
        .toEqual({ type: 'category', categoryKey: 'psychedelics' });
    });

    it('parses mechanism routes with qualifier', () => {
      expect(parsePath('/mechanism/5-ht2a-agonist', null))
        .toEqual({ type: 'mechanism', mechanismSlug: '5-ht2a-agonist' });
      expect(parsePath('/mechanism/5-ht2a-agonist/partial', null))
        .toEqual({ type: 'mechanism', mechanismSlug: '5-ht2a-agonist', qualifierSlug: 'partial' });
    });

    it('decodes search queries', () => {
      expect(parsePath('/search/test%20query', null))
        .toEqual({ type: 'search', query: 'test query' });
    });

    it('parses dev tab aliases', () => {
      expect(parsePath('/dev/gen', null)).toEqual({ type: 'dev', tab: 'generator' });
      expect(parsePath('/dev/tag', null)).toEqual({ type: 'dev', tab: 'tag-editor' });
      expect(parsePath('/dev/changelog', null)).toEqual({ type: 'dev', tab: 'change-log' });
    });

    it('returns default view for empty path', () => {
      expect(parsePath('', null)).toEqual({ type: 'substances' });
      expect(parsePath('/', null)).toEqual({ type: 'substances' });
    });
  });

  describe('round-trip consistency', () => {
    const testViews: AppView[] = [
      { type: 'substances' },
      { type: 'substance', slug: 'lsd' },
      { type: 'effects' },
      { type: 'effect', effectSlug: 'euphoria' },
      { type: 'category', categoryKey: 'psychedelics' },
      { type: 'mechanism', mechanismSlug: 'gaba-modulator' },
      { type: 'mechanism', mechanismSlug: 'gaba-modulator', qualifierSlug: 'positive' },
      { type: 'classification', classification: 'chemical', slug: 'tryptamine' },
      { type: 'classification', classification: 'psychoactive', slug: 'psychedelic' },
      { type: 'interactions' },
      { type: 'interactions', primarySlug: 'lsd' },
      { type: 'interactions', primarySlug: 'lsd', secondarySlug: 'mdma' },
      { type: 'about' },
      { type: 'search', query: 'test' },
      { type: 'dev', tab: 'edit' },
      { type: 'dev', tab: 'generator', slug: 'lsd' },
      { type: 'contributor', profileKey: 'alice' },
    ];

    it.each(testViews)('round-trips view: %o', (view) => {
      const path = viewToPath(view);
      const parsed = parsePath(path, null);
      expect(parsed).toEqual(view);
    });
  });
});
