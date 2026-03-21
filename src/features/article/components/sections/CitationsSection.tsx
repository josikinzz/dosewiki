import { memo, useState } from "react";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { SubstanceArticle, Citation } from "@/schema";
import { getFaviconForUrl } from "@/data/config/sourceFavicons";

const COLLAPSED_LIMIT = 3;

interface CitationsSectionProps {
  article: SubstanceArticle;
}

function CitationList({
  citations,
  startIndex = 0,
}: {
  citations: Citation[];
  startIndex?: number;
}) {
  return (
    <ol className="space-y-2">
      {citations.map((citation, idx) => {
        const favicon = citation.url ? getFaviconForUrl(citation.url) : null;

        return (
          <li
            key={idx}
            className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-fuchsia-400/30 hover:bg-white/8"
          >
            {favicon ? (
              <AppImage
                src={favicon}
                alt=""
                width={20}
                height={20}
                className="mt-0.5 h-5 w-5 shrink-0 rounded"
              />
            ) : (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/20 text-xs font-medium text-fuchsia-300">
                {startIndex + idx + 1}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <span className="text-sm text-white/80">{citation.name}</span>
              {citation.url && (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs text-fuchsia-300 hover:text-fuchsia-200"
                >
                  <Icon icon="lucide:external-link" size={12} className="shrink-0" />
                  <span className="truncate">{citation.url}</span>
                </a>
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
  const sourceCitations = article.source_citations ?? [];
  const { citations } = article;

  const hasSourceCitations = sourceCitations.length > 0;
  const hasCitations = citations.length > 0;

  if (!hasSourceCitations && !hasCitations) {
    return null;
  }

  const totalCitations = sourceCitations.length + citations.length;
  const hasMoreCitations = citations.length > COLLAPSED_LIMIT;
  const visibleCitations = isExpanded ? citations : citations.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = citations.length - COLLAPSED_LIMIT;

  return (
    <div id="sources" className="space-y-8 pt-12 scroll-mt-6">
      {hasSourceCitations && (
        <div className="space-y-6">
          <SectionHeader icon="lucide:library" title="Sources" />
          <CitationList citations={sourceCitations} startIndex={0} />
        </div>
      )}

      {hasCitations && (
        <div className={hasSourceCitations ? "pt-12 space-y-6" : "space-y-6"}>
          <SectionHeader icon="lucide:book-open" title="Further Reading" />
          <CitationList
            citations={visibleCitations}
            startIndex={sourceCitations.length}
          />
          {hasMoreCitations && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80"
              >
                <span className="font-medium">+{hiddenCount}</span>
                <Icon icon="lucide:chevron-down" size={14} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-white/50">
        {totalCitations} source{totalCitations !== 1 ? "s" : ""} cited
      </p>
    </div>
  );
});
