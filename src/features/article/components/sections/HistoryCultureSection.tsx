"use client";

import { Fragment, memo, useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import type { SubstanceArticle } from "@/schema";
import { ArticleSection } from "@/components/common/ArticleSection";
import { articleSectionAdornmentClassName } from "@/components/common/articleSectionLayout";
import { cn } from "@/lib/utils";
import { getIconForHistoryHeading } from "./historyCultureIcons";
import { needsTruncation, renderWithBoldYears, truncateContent } from "./historyCultureText";
import { renderCitedText } from "../CitedText";


interface HistoryCultureSectionProps {
  article: SubstanceArticle;
}

function renderHistoryText(text: string, article: SubstanceArticle) {
  return renderCitedText(text, article).map((node, index) => (
    typeof node === "string"
      ? <Fragment key={`history-text-${index}`}>{renderWithBoldYears(node)}</Fragment>
      : node
  ));
}

/** Card component for individual notable people */
function NotableIndividualCard({
  article,
  name,
  content,
  isExpanded,
  onToggle,
}: {
  article: SubstanceArticle;
  name: string;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full text-left rounded-lg border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06] hover:border-white/15"
    >
      <div className="flex items-center gap-3">
        {/* Placeholder photo circle */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
          <Icon icon="lucide:user" size={20} className="text-white/40" />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-white/90 truncate">{name}</span>
        </div>

        {/* Expand/collapse indicator */}
        <Icon
          icon="lucide:chevron-down"
          size={16}
          className={`flex-shrink-0 text-white/40 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <>
          <div className="theme-horizontal-divider mb-3 mt-3" />
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
            {renderHistoryText(content, article)}
          </p>
        </>
      )}
    </button>
  );
}

export const HistoryCultureSection = memo(function HistoryCultureSection({
  article,
}: HistoryCultureSectionProps) {
  const { history_culture } = article;
  // Track whether the entire section is expanded
  const [isExpanded, setIsExpanded] = useState(false);
  // Track which individual cards are expanded (by "sectionIdx-subIdx" key) - only used when section is expanded
  const [expandedIndividuals, setExpandedIndividuals] = useState<Set<string>>(new Set());

  // Return null if history_culture is not present (optional field)
  if (!history_culture) {
    return null;
  }

  const hasContent = history_culture.content?.trim().length > 0;

  // Filter out empty sections (a section is valid if it has content OR has subsections)
  const sections = history_culture.sections?.filter(
    (section) => {
      const hasHeading = section.heading.trim().length > 0;
      const hasSectionContent = section.content.trim().length > 0;
      const hasSubsections = section.subsections && section.subsections.length > 0;
      return hasHeading && (hasSectionContent || hasSubsections);
    }
  ) ?? [];

  // Nothing to show
  if (!hasContent && sections.length === 0) {
    return null;
  }

  // Determine if we need truncation for the sections view
  // We truncate based on the first section's content
  const firstSection = sections[0];
  const needsSectionsTruncation = sections.length > 0 && (
    sections.length > 1 || // Multiple sections always truncate
    (firstSection && needsTruncation(firstSection.content)) || // First section content is long
    (firstSection?.subsections && firstSection.subsections.length > 0) // Has subsections
  );

  const toggleIndividual = (key: string) => {
    setExpandedIndividuals(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <ArticleSection
      id="history-culture"
      icon="lucide:book-open"
      heading="History & Culture"
    >
      {hasContent && sections.length > 0 && (
        <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
          {renderHistoryText(history_culture.content, article)}
        </p>
      )}

      {/* Freeform content (no subsections) */}
      {hasContent && sections.length === 0 && (() => {
        const content = history_culture.content!;
        const canTruncateFreeform = needsTruncation(content);
        const displayFreeformContent = canTruncateFreeform && !isExpanded
          ? truncateContent(content)
          : content;

        return (
          <>
            <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
              {renderHistoryText(displayFreeformContent, article)}
              {canTruncateFreeform && !isExpanded && "…"}
            </p>
            {canTruncateFreeform && (
              <div className={cn("flex justify-center", articleSectionAdornmentClassName)}>
                <ExpandButton
                  isExpanded={isExpanded}
                  onToggle={() => setIsExpanded(!isExpanded)}
                  ariaLabel={isExpanded ? "Collapse history and culture" : "Expand history and culture"}
                />
              </div>
            )}
          </>
        );
      })()}

      {/* Subsections as stacked cards */}
      {sections.length > 0 && (() => {
        // When collapsed, only show first section with truncated content
        const sectionsToShow = isExpanded ? sections : [firstSection];

        // For collapsed view, truncate the first section's content
        const getDisplayContent = (section: typeof firstSection, idx: number) => {
          if (!section.content.trim()) return "";
          // When collapsed and it's the first section, truncate
          if (!isExpanded && idx === 0) {
            return truncateContent(section.content);
          }
          return section.content;
        };

        return (
          <>
            <div className="space-y-8">
              {sectionsToShow.map((section, idx) => {
                const sectionIcon = getIconForHistoryHeading(section.heading);
                const hasSubsections = section.subsections && section.subsections.length > 0;
                const sectionHasContent = section.content.trim().length > 0;
                const displayContent = getDisplayContent(section, idx);
                const isTruncated = !isExpanded && idx === 0 && sectionHasContent && needsTruncation(section.content);

                return (
                  <section key={idx} className="theme-section-group-divider">
                    <div>
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                        <Icon icon={sectionIcon} size={20} className="text-fuchsia-200" />
                        {section.heading}
                      </h3>
                      {sectionHasContent && (
                        <div className="relative">
                          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
                            {renderHistoryText(displayContent, article)}
                            {isTruncated && "…"}
                          </p>
                        </div>
                      )}

                      {/* Nested subsections - only show when expanded */}
                      {isExpanded && hasSubsections && (
                        section.heading === "Notable Individuals" ? (
                          // Special card-based layout for Notable Individuals
                          <div className={`flex flex-col gap-2 ${sectionHasContent ? 'mt-4' : ''}`}>
                            {section.subsections!.map((sub, subIdx) => {
                              const key = `${idx}-${subIdx}`;
                              return (
                                <NotableIndividualCard
                                  key={subIdx}
                                  article={article}
                                  name={sub.heading}
                                  content={sub.content}
                                  isExpanded={expandedIndividuals.has(key)}
                                  onToggle={() => toggleIndividual(key)}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          // Default nested subsection layout
                          <div className={`flex flex-col gap-3 ${sectionHasContent ? 'mt-4' : ''} pl-4 border-l-2 border-white/10`}>
                            {section.subsections!.map((sub, subIdx) => (
                              <div key={subIdx}>
                                <h4 className="font-medium text-white/90 mb-1">
                                  {sub.heading}
                                </h4>
                                <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{renderHistoryText(sub.content, article)}</p>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* Central See More button - same style as freeform content */}
            {needsSectionsTruncation && (
              <div className={cn("flex justify-center", articleSectionAdornmentClassName)}>
                <ExpandButton
                  isExpanded={isExpanded}
                  onToggle={() => setIsExpanded(!isExpanded)}
                  ariaLabel={isExpanded ? "Collapse history and culture" : "Expand history and culture"}
                />
              </div>
            )}
          </>
        );
      })()}
    </ArticleSection>
  );
});
