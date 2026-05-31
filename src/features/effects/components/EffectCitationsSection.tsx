"use client";

import { useState } from "react";
import { AppImage } from "@/components/common/AppImage";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import { projectEffectCitations } from "@/lib/citationProjection";

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
}

/**
 * Combined sources section for effect articles.
 * Single section header with compact subsection labels.
 */
export function EffectCitationsSection({
  citations = [],
  externalLinks = [],
  seeAlso = [],
}: EffectCitationsSectionProps) {
  const [referencesExpanded, setReferencesExpanded] = useState(false);
  const projection = projectEffectCitations({
    citations,
    externalLinks,
    seeAlso,
    expandedReferences: referencesExpanded,
  });
  const { internalRelatedLinks, externalLinks: projectedExternalLinks, references } = projection;

  if (projection.isEmpty) {
    return null;
  }

  return (
    <div className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="lucide:library" title="Sources & References" />

      <div className="space-y-6">
        {/* See Also */}
        {internalRelatedLinks.items.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              {internalRelatedLinks.title}
            </h3>
            <ul className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm">
              {internalRelatedLinks.items.map((item, index) => (
                <li key={index} className="inline">
                  <a
                    href={item.url}
                    className="text-fuchsia-300 hover:text-fuchsia-200 transition-colors"
                  >
                    {item.label}
                  </a>
                  {index < internalRelatedLinks.items.length - 1 && (
                    <span className="text-white/25 ml-1.5">&middot;</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* External Links */}
        {projectedExternalLinks.items.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              {projectedExternalLinks.title}
            </h3>
            <ul className="space-y-1.5">
              {projectedExternalLinks.items.map((link, index) => {
                return (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    {link.favicon ? (
                      <AppImage
                        src={link.favicon}
                        alt=""
                        width={16}
                        height={16}
                        className="h-4 w-4 shrink-0 rounded-sm"
                      />
                    ) : (
                      <Icon icon="lucide:external-link" size={14} className="shrink-0 text-white/40" />
                    )}
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-fuchsia-300 hover:text-fuchsia-200 transition-colors truncate"
                    >
                      {link.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* References */}
        {references.items.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              {references.title}
            </h3>
            <ol className="space-y-2">
              {references.visibleItems.map((citation, index) => {
                return (
                  <li
                    key={index}
                    id={citation.anchorId}
                    className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-fuchsia-400/30 hover:bg-white/8 scroll-mt-20"
                  >
                    {citation.favicon ? (
                      <AppImage
                        src={citation.favicon}
                        alt=""
                        width={20}
                        height={20}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded"
                      />
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/20 text-xs font-medium text-fuchsia-300">
                        {citation.number}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      {citation.label && (
                        <span className="text-sm text-white/80">{citation.label}</span>
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
            {references.hasCollapsedItems && (
              <div className="mt-3 flex justify-center">
                <ExpandButton
                  isExpanded={referencesExpanded}
                  onToggle={() => setReferencesExpanded(!referencesExpanded)}
                  variant="count"
                  count={references.collapsedCount}
                  ariaLabel={referencesExpanded ? "Collapse references" : "Expand references"}
                />
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
