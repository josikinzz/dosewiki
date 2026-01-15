import { memo } from "react";
import { Icon } from "../common/Icon";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { SubstanceArticle, Citation } from "../../schema";
import { getFaviconForUrl } from "../../data/config/sourceFavicons";

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
              <img
                src={favicon}
                alt=""
                className="mt-0.5 h-5 w-5 shrink-0 rounded"
                loading="lazy"
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
  const sourceCitations = article.source_citations ?? [];
  const { citations } = article;

  const hasSourceCitations = sourceCitations.length > 0;
  const hasCitations = citations.length > 0;

  if (!hasSourceCitations && !hasCitations) {
    return null;
  }

  const totalCitations = sourceCitations.length + citations.length;

  return (
    <SectionCard delay={0}>
      {hasSourceCitations && (
        <div>
          <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
            <IconBadge icon="lucide:library" label="Sources" />
            Sources
          </h2>
          <CitationList citations={sourceCitations} startIndex={0} />
        </div>
      )}

      {hasCitations && (
        <div className={hasSourceCitations ? "mt-6" : ""}>
          <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
            <IconBadge icon="lucide:book-open" label="Further Reading" />
            Further Reading
          </h2>
          <CitationList
            citations={citations}
            startIndex={sourceCitations.length}
          />
        </div>
      )}

      <p className="mt-4 text-xs text-white/50">
        {totalCitations} source{totalCitations !== 1 ? "s" : ""} cited
      </p>
    </SectionCard>
  );
});
