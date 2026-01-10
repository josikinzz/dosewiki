import { Library, BookOpen } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { CitationEntry } from "../../types/content";
import { getFaviconForUrl } from "../../data/config/sourceFavicons";

interface CitationsSectionProps {
  sourceCitations: CitationEntry[];
  citations: CitationEntry[];
}

function CitationList({ citations, large = false }: { citations: CitationEntry[]; large?: boolean }) {
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {citations.map((citation) => {
        const favicon = citation.href ? getFaviconForUrl(citation.href) : null;

        if (large) {
          return (
            <li
              key={`${citation.label}-${citation.href ?? ''}`}
              className="grid grid-cols-[auto_1fr] grid-rows-[auto_auto] gap-x-4 gap-y-0.5 rounded-lg border border-white/10 bg-white/5 p-4 text-white/85"
            >
              <div className="row-span-2 self-center">
                {favicon ? (
                  <img
                    src={favicon}
                    alt=""
                    className="h-10 w-10 rounded"
                    loading="lazy"
                  />
                ) : (
                  <span className="h-10 w-10 rounded bg-fuchsia-500/20" />
                )}
              </div>
              {citation.href ? (
                <a
                  href={citation.href}
                  className="cursor-pointer font-medium text-fuchsia-200 underline-offset-4 transition hover:text-fuchsia-100 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {citation.label}
                </a>
              ) : (
                <span className="font-medium transition-colors hover:text-white">
                  {citation.label}
                </span>
              )}
              <span className="text-xs text-white/40 truncate max-w-md">
                {citation.href ? new URL(citation.href).hostname : ''}
              </span>
            </li>
          );
        }

        return (
          <li
            key={`${citation.label}-${citation.href ?? ''}`}
            className="flex items-center gap-2 text-white/85"
          >
            {favicon ? (
              <img
                src={favicon}
                alt=""
                className="h-5 w-5 rounded"
                loading="lazy"
              />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
            )}
            {citation.href ? (
              <a
                href={citation.href}
                className="cursor-pointer text-fuchsia-200 underline-offset-4 transition hover:text-fuchsia-100 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {citation.label}
              </a>
            ) : (
              <span className="transition-colors hover:text-white">
                {citation.label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CitationsSection({ sourceCitations, citations }: CitationsSectionProps) {
  const hasSourceCitations = sourceCitations && sourceCitations.length > 0;
  const hasCitations = citations && citations.length > 0;

  if (!hasSourceCitations && !hasCitations) {
    return null;
  }

  return (
    <SectionCard delay={0.35}>
      {hasSourceCitations && (
        <div>
          <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-300">
            <IconBadge icon={Library} label="Sources" />
            Sources
          </h2>
          <CitationList citations={sourceCitations} large />
        </div>
      )}

      {hasCitations && (
        <div className={hasSourceCitations ? "mt-6" : ""}>
          <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-300">
            <IconBadge icon={BookOpen} label="Further Reading" />
            Further Reading
          </h2>
          <CitationList citations={citations} />
        </div>
      )}
    </SectionCard>
  );
}
