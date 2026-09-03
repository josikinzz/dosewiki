import { describe, it, expect } from 'vitest';
import { viewToPath, parsePath } from './routing';
import type { AppView } from '@/types/navigation';
import { DEV_TAB_REGISTRY } from '@/features/dev/pages/devTabRegistry';

describe('routing', () => {
  describe('viewToPath', () => {
    it('generates correct paths for all view types', () => {
      expect(viewToPath({ type: 'substances' })).toBe('/substances');
      expect(viewToPath({ type: 'mantras' })).toBe('/mantras');
      expect(viewToPath({ type: 'replications' })).toBe('/replications');
      expect(viewToPath({ type: 'effects' })).toBe('/effects');
      expect(viewToPath({ type: 'about' })).toBe('/about');
      expect(viewToPath({ type: 'report-submit' })).toBe('/reports/submit');
      expect(viewToPath({ type: 'substance', slug: 'lsd' })).toBe('/lsd');
      expect(viewToPath({ type: 'category', categoryKey: 'psychedelics' })).toBe('/category/psychedelics');
    });

    it('handles mechanism with optional qualifier', () => {
      expect(viewToPath({ type: 'mechanism', mechanismSlug: '5-ht2a-agonist' }))
        .toBe('/mechanism/5-ht2a-agonist');
      expect(viewToPath({ type: 'mechanism', mechanismSlug: '5-ht2a-agonist', qualifierSlug: 'partial' }))
        .toBe('/mechanism/5-ht2a-agonist/partial');
    });

    it('treats interactions as a legacy redirect to substances', () => {
      expect(parsePath('/interactions', null)).toEqual({ type: 'substances' });
      expect(parsePath('/interactions/lsd', null)).toEqual({ type: 'substances' });
      expect(parsePath('/interactions/lsd/mdma', null)).toEqual({ type: 'substances' });
    });

    it('encodes search queries', () => {
      expect(viewToPath({ type: 'search', query: 'test query' }))
        .toBe('/search?q=test%20query');
    });

    it('handles dev tabs', () => {
      expect(viewToPath({ type: 'dev', tab: 'tag-editor' })).toBe('/dev/tag-editor');
      expect(viewToPath({ type: 'dev', tab: 'citation-review' })).toBe('/dev/citation-review');
      expect(viewToPath({ type: 'dev', tab: 'articles', slug: 'lsd' })).toBe('/dev/articles/lsd');
    });

    it('keeps a dev tab filter in the query string', () => {
      expect(viewToPath({ type: 'dev', tab: 'writing', filter: 'blog' })).toBe('/dev/writing?kind=blog');
      expect(viewToPath({ type: 'dev', tab: 'writing', slug: 'first-post', filter: 'blog' })).toBe(
        '/dev/writing/first-post?kind=blog',
      );
    });

    it('canonicalizes contributor paths with the public route casing policy', () => {
      expect(viewToPath({ type: 'contributor', profileKey: 'Ada@Example.COM' }))
        .toBe('/contributors/ada%40example.com');
    });
  });

  describe('parsePath', () => {
    it('parses all standard routes', () => {
      expect(parsePath('/substances', null)).toEqual({ type: 'substances' });
      expect(parsePath('/mantras', null)).toEqual({ type: 'mantras' });
      expect(parsePath('/replications', null)).toEqual({ type: 'replications' });
      expect(parsePath('/effects', null)).toEqual({ type: 'effects' });
      expect(parsePath('/about', null)).toEqual({ type: 'about' });
      expect(parsePath('/reports/submit', null)).toEqual({ type: 'report-submit' });
    });

    it("keeps routed index groups inside their owning section", () => {
      expect(parsePath("/substances/group/stimulant", null)).toEqual({
        type: "substances",
      });
      expect(parsePath("/effects/group/cognitive", null)).toEqual({
        type: "effects",
      });
      expect(parsePath("/reports/group/author", null)).toEqual({
        type: "reports",
      });
    });

    it('keeps every replications sub-page inside the replications section', () => {
      // Regression: before /replications had a case, the `default:` arm read these as
      // substance slugs (`{ type: 'substance', slug: 'replications' }`), which put the
      // audio and tutorials pages under the Substances nav group.
      expect(parsePath('/replications/audio', null)).toEqual({ type: 'replications' });
      expect(parsePath('/replications/tutorials', null)).toEqual({ type: 'replications' });
    });

    it('resolves Next-internal prerender pathnames to the default view, never a substance', () => {
      // usePathname() replays a statically prerendered page's canonical name on first
      // load: `/index` for the root page, `/_not-found` for the 404 page. Regression:
      // the `default:` arm read them as substance slugs, which lit the Substances nav
      // item on Effect Index's prerendered homepage and on 404s.
      expect(parsePath('/index', null, { type: 'home' })).toEqual({ type: 'home' });
      expect(parsePath('/_not-found', null, { type: 'home' })).toEqual({ type: 'home' });
      expect(parsePath('/index', null)).toEqual({ type: 'substances' });
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
      expect(parsePath('/search?q=test%20query', null))
        .toEqual({ type: 'search', query: 'test query' });
      expect(parsePath('/search/test%20query', null))
        .toEqual({ type: 'search', query: 'test query' });
    });

    it('parses dev tab aliases', () => {
      expect(parsePath('/dev/gen', null)).toEqual({ type: 'dev', tab: 'articles' });
      expect(parsePath('/dev/tag', null)).toEqual({ type: 'dev', tab: 'tag-editor' });
      expect(parsePath('/dev/changelog', null)).toEqual({ type: 'dev', tab: 'change-log' });
      expect(parsePath('/dev/citations', null)).toEqual({ type: 'dev', tab: 'citation-review' });
    });

    it('parses the molecule editor dev tab and its alias', () => {
      // viewToPath emits `/dev/molecule-editor`; without this case the tab click
      // navigates but parsePath falls back to `articles`, so the Molecules tab
      // never activates (it "waits then nothing happens").
      expect(parsePath('/dev/molecule-editor', null)).toEqual({ type: 'dev', tab: 'molecule-editor' });
      expect(parsePath('/dev/molecules', null)).toEqual({ type: 'dev', tab: 'molecule-editor' });
    });

    it('parses every registry id and alias to its tab, with and without a slug', () => {
      for (const tab of DEV_TAB_REGISTRY) {
        for (const segment of [tab.id, ...tab.aliases]) {
          expect(parsePath(`/dev/${segment}`, null)).toEqual({ type: 'dev', tab: tab.id });
          expect(parsePath(`/dev/${segment}/lsd`, null)).toEqual({ type: 'dev', tab: tab.id, slug: 'lsd' });
        }
      }
    });

    it('pins /dev/about onto the Writing tab and falls back to articles for unknown tabs', () => {
      expect(parsePath('/dev/about', null)).toEqual({ type: 'dev', tab: 'writing', slug: 'about' });
      expect(parsePath('/dev', null)).toEqual({ type: 'dev', tab: 'articles' });
      expect(parsePath('/dev/unknown-tab/ketamine', null)).toEqual({ type: 'dev', tab: 'articles', slug: 'ketamine' });
    });

    it('parses the Writing kind from /dev/blog and from ?kind=', () => {
      expect(parsePath('/dev/blog', null)).toEqual({ type: 'dev', tab: 'writing', filter: 'blog' });
      expect(parsePath('/dev/blog/first-post', null)).toEqual({
        type: 'dev',
        tab: 'writing',
        slug: 'first-post',
        filter: 'blog',
      });
      expect(parsePath('/dev/writing?kind=blog', null)).toEqual({ type: 'dev', tab: 'writing', filter: 'blog' });
      expect(parsePath('/dev/writing?kind=poem', null)).toEqual({ type: 'dev', tab: 'writing' });
    });

    it('returns default view for empty path', () => {
      expect(parsePath('', null)).toEqual({ type: 'substances' });
      expect(parsePath('/', null)).toEqual({ type: 'substances' });
    });
  });

  describe('round-trip consistency', () => {
    const testViews: AppView[] = [
      { type: 'substances' },
      { type: 'mantras' },
      { type: 'replications' },
      { type: 'substance', slug: 'lsd' },
      { type: 'effects' },
      { type: 'effect', effectSlug: 'euphoria' },
      { type: 'category', categoryKey: 'psychedelics' },
      { type: 'mechanism', mechanismSlug: 'gaba-modulator' },
      { type: 'mechanism', mechanismSlug: 'gaba-modulator', qualifierSlug: 'positive' },
      { type: 'classification', classification: 'chemical', slug: 'tryptamine' },
      { type: 'classification', classification: 'psychoactive', slug: 'psychedelic' },
      { type: 'about' },
      { type: 'search', query: 'test' },
      { type: 'report-submit' },
      { type: 'dev', tab: 'tag-editor' },
      { type: 'dev', tab: 'citation-review' },
      { type: 'dev', tab: 'molecule-editor' },
      { type: 'dev', tab: 'articles', slug: 'lsd' },
      { type: 'dev', tab: 'writing', filter: 'blog' },
      { type: 'dev', tab: 'writing', slug: 'first-post', filter: 'blog' },
      { type: 'contributor', profileKey: 'alice' },
    ];

    it.each(testViews)('round-trips view: %o', (view) => {
      const path = viewToPath(view);
      const parsed = parsePath(path, null);
      expect(parsed).toEqual(view);
    });
  });
});
