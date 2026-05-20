import { memo, useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { SubstanceArticle } from "@/schema";
import { projectSubstanceCitations, type ProjectedCitation } from "@/lib/citationProjection";

interface CitationsSectionProps {
  article: SubstanceArticle;
}

function CitationList({
  citations,
}: {
  citations: ProjectedCitation[];
}) {
  return (
    <ol className="space-y-2">
      {citations.map((citation, idx) => {
        return (
          <li
            id={citation.anchorId}
            key={`${citation.role}-${citation.anchorId}-${idx}`}
            className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-fuchsia-400/30 hover:bg-white/8"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/20 text-xs font-medium text-fuchsia-300">
              {citation.number}
            </span>
            <div className="min-w-0 flex-1">
              {citation.url ? (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm leading-relaxed text-white/80 decoration-white/30 underline-offset-2 hover:text-fuchsia-200"
                >
                  {citation.label}
                </a>
              ) : (
                <span className="text-sm leading-relaxed text-white/80">{citation.label}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const CitationsSection = memo(function CitationsSection({
  article,
}: CitationsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const projection = projectSubstanceCitations({
    article,
    references: article.references,
    sourceCitations: article.source_citations,
    citations: article.citations,
    expandedFurtherReading: isExpanded,
    expandedReferences: isExpanded,
  });
  const { references, primarySources, furtherReading } = projection;

  if (projection.isEmpty) {
    return null;
  }

  return (
    <div id="sources" className="space-y-8 pt-12 scroll-mt-6">
      {references.items.length > 0 && (
        <div className="space-y-6">
          <SectionHeader icon="lucide:list-ordered" title={references.title} />
          <CitationList citations={references.visibleItems} />
          {references.hasCollapsedItems && (
            <div className="mt-3 flex justify-center">
              <ExpandButton
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
                variant="count"
                count={references.collapsedCount}
                ariaLabel={isExpanded ? "Collapse references" : "Expand references"}
              />
            </div>
          )}
        </div>
      )}

      {primarySources.items.length > 0 && (
        <div className={references.items.length > 0 ? "pt-12 space-y-6" : "space-y-6"}>
          <SectionHeader icon="lucide:library" title={primarySources.title} />
          <CitationList citations={primarySources.visibleItems} />
        </div>
      )}

      {furtherReading.items.length > 0 && (
        <div className={primarySources.items.length > 0 || references.items.length > 0 ? "pt-12 space-y-6" : "space-y-6"}>
          <SectionHeader icon="lucide:book-open" title={furtherReading.title} />
          <CitationList citations={furtherReading.visibleItems} />
          {furtherReading.hasCollapsedItems && (
            <div className="mt-3 flex justify-center">
              <ExpandButton
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
                variant="count"
                count={furtherReading.collapsedCount}
                ariaLabel={isExpanded ? "Collapse further reading" : "Expand further reading"}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
});
