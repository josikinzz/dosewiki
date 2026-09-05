/**
 * Rebasing a returned proposal: the queue hands over one full proposal row and
 * the working set becomes that proposal on top of current production.
 *
 * Seeding goes through the same paths an edit would. Each proposed article's
 * production row is hydrated first (draft and baseline together, so the save
 * diff compares against the whole article production holds now), then the
 * proposed fields are laid over the draft row; an article production does not
 * have is appended as a new row. Proposed index layouts replace the layout
 * drafts. What was seeded is remembered so a discard can put exactly those
 * rows back.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { ManualIndexConfig } from "@/data/builders/manualIndexLoader";
import type { SubstanceArticle } from "@/schema";
import type { ArticleRecord, DevActiveProposal, DevProposalSeed } from "./devModeTypes";
import { resolveEditorArticleSlug } from "./devModeUtils";

type LayoutType = "psychoactive" | "chemical" | "mechanism";

type LayoutControls = {
  replace: (next: ManualIndexConfig) => void;
  reset: () => void;
};

type SeededKeys = { slugs: ReadonlySet<string>; layouts: ReadonlySet<LayoutType> };

type ProposedArticle = NonNullable<DevProposalSeed["payload"]["articles"]>[number];

export function useDevProposalSeed({
  hasUnsavedChanges,
  hydrateArticlesNow,
  applyArticlesTransform,
  getOriginalArticles,
  layouts,
}: {
  hasUnsavedChanges: boolean;
  hydrateArticlesNow: (slugs: readonly string[]) => Promise<{ ok: boolean; articles: SubstanceArticle[] }>;
  applyArticlesTransform: (transform: (previous: ArticleRecord[]) => ArticleRecord[]) => void;
  getOriginalArticles: () => ArticleRecord[];
  layouts: Record<LayoutType, LayoutControls>;
}) {
  const [activeProposal, setActiveProposal] = useState<DevActiveProposal | null>(null);
  const seededRef = useRef<SeededKeys | null>(null);
  const dirtyRef = useRef(hasUnsavedChanges);
  dirtyRef.current = hasUnsavedChanges;

  const loadProposal = useCallback(
    async (seed: DevProposalSeed) => {
      if (dirtyRef.current) {
        throw new Error("You have unsaved editor changes. Return to the editor and submit or discard them before loading a submission.");
      }
      const proposedBySlug = new Map<string, ProposedArticle>();
      for (const article of seed.payload.articles ?? []) {
        proposedBySlug.set(resolveEditorArticleSlug(article as SubstanceArticle), article);
      }

      // Only slugs production holds are hydrated; a proposal for a new
      // article has nothing to load and is appended below.
      const known = new Set(getOriginalArticles().map((article) => resolveEditorArticleSlug(article)));
      const toHydrate = [...proposedBySlug.keys()].filter((slug) => known.has(slug));
      if (toHydrate.length > 0) {
        const hydrated = await hydrateArticlesNow(toHydrate);
        if (!hydrated.ok) {
          const landed = new Set(hydrated.articles.map((article) => resolveEditorArticleSlug(article)));
          const missing = toHydrate.filter((slug) => !landed.has(slug));
          throw new Error(`Could not load ${missing.join(", ")} from the library; try again.`);
        }
      }
      if (dirtyRef.current) {
        throw new Error("Your editor draft changed while this submission was loading. Submit or discard those edits before trying again.");
      }

      applyArticlesTransform((previous) => {
        const remaining = new Map(proposedBySlug);
        const next = previous.map((article) => {
          const slug = resolveEditorArticleSlug(article);
          const proposal = remaining.get(slug);
          if (!proposal) {
            return article;
          }
          remaining.delete(slug);
          return { ...article, ...proposal } as ArticleRecord;
        });
        for (const proposal of remaining.values()) {
          next.push(proposal as ArticleRecord);
        }
        return next;
      });

      const seededLayouts = new Set<LayoutType>();
      for (const layout of seed.payload.indexLayouts ?? []) {
        layouts[layout.type].replace({ version: layout.version, categories: layout.categories });
        seededLayouts.add(layout.type);
      }

      seededRef.current = { slugs: new Set(proposedBySlug.keys()), layouts: seededLayouts };
      setActiveProposal({ proposalId: seed.proposalId, reason: seed.reason, summary: seed.summary });
    },
    [applyArticlesTransform, getOriginalArticles, hydrateArticlesNow, layouts],
  );

  const clearActiveProposal = useCallback(() => {
    seededRef.current = null;
    setActiveProposal(null);
  }, []);

  const discardActiveProposal = useCallback(() => {
    const seeded = seededRef.current;
    if (seeded) {
      applyArticlesTransform((previous) => {
        const original = getOriginalArticles();
        const next: ArticleRecord[] = [];
        previous.forEach((article, index) => {
          if (!seeded.slugs.has(resolveEditorArticleSlug(article))) {
            next.push(article);
            return;
          }
          // A seeded row production holds goes back to production; one the
          // proposal appended goes away.
          const baseline = original[index];
          if (baseline) {
            next.push(baseline);
          }
        });
        return next;
      });
      for (const type of seeded.layouts) {
        layouts[type].reset();
      }
    }
    clearActiveProposal();
  }, [applyArticlesTransform, clearActiveProposal, getOriginalArticles, layouts]);

  return useMemo(
    () => ({ activeProposal, loadProposal, clearActiveProposal, discardActiveProposal }),
    [activeProposal, clearActiveProposal, discardActiveProposal, loadProposal],
  );
}
