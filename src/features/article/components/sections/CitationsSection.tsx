import { memo } from "react";
import type { CitationBacklink } from "@/components/common/ReferenceList";
import { CITE_TOKEN_PATTERN } from "@/lib/citations/citationTokens";
import { getArticleCitationModel } from "@/lib/citations/referenceModel";
import { projectSubstanceCitations } from "@/lib/citationProjection";
import type { SubstanceArticle } from "@/schema";
import { CitationsSectionView } from "./CitationsSectionView.client";

interface CitationsSectionProps {
  article: SubstanceArticle;
}

function collectArticleReferenceUses(article: SubstanceArticle) {
  const uses: Record<string, CitationBacklink[]> = {};
  const countsByReferenceId = new Map<string, number>();

  const addUse = (referenceId: string, href = "#sources") => {
    if (!referenceId.trim()) return;
    const count = (countsByReferenceId.get(referenceId) ?? 0) + 1;
    countsByReferenceId.set(referenceId, count);
    uses[referenceId] ??= [];
    uses[referenceId].push({
      href,
      label: String(count),
      occurrenceIndex: count - 1,
      referenceId,
    });
  };

  const visit = (value: unknown, seen: WeakSet<object>) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(CITE_TOKEN_PATTERN)) addUse(match[1]);
      return;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item, seen);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        key === "references" ||
        key === "citations" ||
        key === "source_citations" ||
        key === "editorial_review"
      )
        continue;
      if (key === "reference_ids" && Array.isArray(child)) {
        child.forEach((referenceId) => {
          if (typeof referenceId === "string") addUse(referenceId);
        });
      } else {
        visit(child, seen);
      }
    }
  };

  visit(article, new WeakSet());
  return uses;
}

/**
 * Server-compatible projection boundary. Public routes compute the article-wide
 * citation model once and send only the projected lists and backlink seed to
 * the interactive view. Client editor previews still recompute when their
 * article value changes.
 */
export const CitationsSection = memo(function CitationsSection({
  article,
}: CitationsSectionProps) {
  const projection = projectSubstanceCitations({
    article,
    numbering: getArticleCitationModel(article),
    references: article.references,
    sourceCitations: article.source_citations,
    citations: article.citations,
  });

  if (projection.isEmpty) return null;

  return (
    <CitationsSectionView
      projection={projection}
      initialBacklinks={collectArticleReferenceUses(article)}
    />
  );
});
