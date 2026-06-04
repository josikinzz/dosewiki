"use client";

import { useState } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { CitationListItem } from "@/components/common/CitationListItem";
import { ExpandButton } from "@/components/common/ExpandButton";
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
  id?: string;
  citations?: Citation[];
  externalLinks?: ExternalLink[];
  seeAlso?: SeeAlso[];
}

/**
 * Combined sources section for effect articles.
 * Single section header with compact subsection labels.
 */
export function EffectCitationsSection({
  id = "sources",
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
    <ArticleSection
      id={id}
      icon="lucide:library"
      heading="Sources & References"
      spacing="effect"
    >
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
            <ul className="space-y-2">
              {projectedExternalLinks.items.map((link, index) => (
                <CitationListItem
                  key={index}
                  number={link.number}
                  label={link.label}
                  href={link.url}
                  faviconSrc={link.favicon}
                />
              ))}
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
              {references.visibleItems.map((citation, index) => (
                <CitationListItem
                  key={index}
                  id={citation.anchorId}
                  number={citation.number}
                  label={citation.label}
                  href={citation.url}
                  faviconSrc={citation.favicon}
                  showHref
                  className="scroll-mt-20"
                />
              ))}
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
    </ArticleSection>
  );
}
