import { useState } from "react";
import { Icon } from "@/components/common/Icon";
import { IconBadge } from "@/components/common/IconBadge";
import { SectionCard } from "@/components/common/SectionCard";
import { getFaviconForUrl } from "@/data/config/sourceFavicons";

interface Citation {
  url: string;
  text: string;
  from?: string;
}

interface ExternalLink {
  url: string;
  title: string;
}

interface SeeAlso {
  location: string;
  title: string;
}

interface EffectCitationsSectionProps {
  citations?: Citation[];
  externalLinks?: ExternalLink[];
  seeAlso?: SeeAlso[];
  onNavigate?: (path: string) => void;
}

/**
 * Combined citations, external links, and see also section for effect articles.
 * Collapsible (expanded by default) with a toggle button.
 */
export function EffectCitationsSection({ 
  citations = [],
  externalLinks = [],
  seeAlso = [],
  onNavigate,
}: EffectCitationsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (citations.length === 0 && externalLinks.length === 0 && seeAlso.length === 0) {
    return null;
  }

  const totalCount = citations.length + externalLinks.length + seeAlso.length;

  const handleSeeAlsoClick = (location: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate(location);
    } else {
      window.history.pushState({}, "", location);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  return (
    <SectionCard delay={0.3}>
      {/* Header with toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="mb-4 flex w-full items-center gap-3 text-left"
      >
        <IconBadge icon="lucide:library" label="Sources & References" />
        <h2 className="flex-1 text-lg font-semibold text-fuchsia-300">
          Sources & References
        </h2>
        <span className="text-sm text-white/50">({totalCount})</span>
        <Icon 
          icon="lucide:chevron-down" 
          size={20} 
          className={`text-white/50 transition-transform ${isExpanded ? "rotate-180" : ""}`} 
        />
      </button>

      {/* Collapsible content */}
      {isExpanded && (
        <div className="space-y-6">
          {/* See Also */}
          {seeAlso.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-white/50">
                <Icon icon="lucide:link" size={14} />
                See Also
              </h3>
              <ol className="space-y-2">
                {seeAlso.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-fuchsia-400/30 hover:bg-white/8"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/20 text-xs font-medium text-fuchsia-300">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={item.location}
                        onClick={handleSeeAlsoClick(item.location)}
                        className="text-sm text-white/80 hover:text-fuchsia-200 cursor-pointer transition-colors"
                      >
                        {item.title}
                      </a>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* External Links */}
          {externalLinks.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-white/50">
                <Icon icon="lucide:external-link" size={14} />
                External Links
              </h3>
              <ol className="space-y-2">
                {externalLinks.map((link, index) => {
                  const favicon = getFaviconForUrl(link.url);
                  return (
                    <li
                      key={index}
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
                          {index + 1}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-white/80">{link.title}</span>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 flex items-center gap-1 text-xs text-fuchsia-300 hover:text-fuchsia-200"
                        >
                          <Icon icon="lucide:external-link" size={12} className="shrink-0" />
                          <span className="truncate">{link.url}</span>
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Citations / References */}
          {citations.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-white/50">
                <Icon icon="lucide:book-open" size={14} />
                References
              </h3>
              <ol className="space-y-2">
                {citations.map((citation, index) => {
                  const favicon = getFaviconForUrl(citation.url);
                  const anchorId = citation.from 
                    ? `cite-${citation.from}` 
                    : `cite-${index + 1}`;
                  
                  return (
                    <li
                      key={index}
                      id={anchorId}
                      className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-fuchsia-400/30 hover:bg-white/8 scroll-mt-20"
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
                          {index + 1}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        {citation.text && (
                          <span className="text-sm text-white/80">{citation.text}</span>
                        )}
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 flex items-center gap-1 text-xs text-fuchsia-300 hover:text-fuchsia-200"
                        >
                          <Icon icon="lucide:external-link" size={12} className="shrink-0" />
                          <span className="truncate">{citation.url}</span>
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <p className="text-xs text-white/50">
            {totalCount} source{totalCount !== 1 ? "s" : ""} cited
          </p>
        </div>
      )}

      {/* Collapsed state summary */}
      {!isExpanded && (
        <p className="text-sm text-white/50">
          {totalCount} source{totalCount !== 1 ? "s" : ""} cited
        </p>
      )}
    </SectionCard>
  );
}
