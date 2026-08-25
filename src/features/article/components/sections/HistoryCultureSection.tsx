"use client";

import { Fragment, memo, useState, type ReactNode } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import type { SubstanceArticle } from "@/schema";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { ArticleSection, ArticleSubsectionCard } from "@/components/common/ArticleSection";
import { articleSectionAdornmentClassName } from "@/components/common/articleSectionLayout";
import { cn } from "@/lib/utils";
import { buildFieldPath, EditableValue } from "../../editing";
import { ArticleGapNotice } from "./ArticleGapNotice";
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

/**
 * One editable slice of history prose, suppressed while its text is truncated.
 *
 * The section renders a mid-word `truncateContent` preview when collapsed, and
 * an editor opened on that preview would offer the truncation as if it were the
 * field. `editable` is the caller's assertion that the rendered text is the
 * whole raw value; when it is false the prose renders exactly as before.
 */
function EditableHistoryText({
  children,
  editable,
  label,
  path,
  value,
}: {
  children: ReactNode;
  editable: boolean;
  label: string;
  path: string;
  value: string;
}) {
  if (!editable) return <>{children}</>;
  return (
    <EditableValue as="span" label={label} path={path} value={value}>
      {children}
    </EditableValue>
  );
}

/** Card component for individual notable people */
function NotableIndividualCard({
  article,
  name,
  content,
  contentPath,
  isExpanded,
  onToggle,
}: {
  article: SubstanceArticle;
  name: string;
  content: string;
  contentPath: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <ArticleSubsectionCard asChild variant="interactive" padding="xs" className="w-full rounded-lg text-left">
      <button
        type="button"
        onClick={onToggle}
      >
      <div className="flex items-center gap-3">
        {/* Placeholder photo circle */}
        <div className="theme-author-avatar-placeholder theme-public-card-subtle flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border">
          <Icon icon="lucide:user" size={20} className="theme-icon-muted" />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <span className="theme-text-primary truncate font-medium">{name}</span>
        </div>

        {/* Expand/collapse indicator */}
        <Icon
          icon="lucide:chevron-down"
          size={16}
          className={`theme-icon-muted flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <>
          <div className="theme-horizontal-divider mb-3 mt-3" />
          <p className="theme-text-secondary whitespace-pre-wrap text-sm leading-relaxed">
            {/* Never truncated here, so the rendered text is the whole field. */}
            <EditableHistoryText
              editable
              label={`${name} biography`}
              path={contentPath}
              value={content}
            >
              {renderHistoryText(content, article)}
            </EditableHistoryText>
          </p>
        </>
      )}
      </button>
    </ArticleSubsectionCard>
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

  // history_culture is an optional field; absent and empty read the same publicly.
  if (!history_culture) {
    return <ArticleGapNotice article={article} section="history_culture" />;
  }

  const hasContent = history_culture.content?.trim().length > 0;

  // Filter out empty sections (a section is valid if it has content OR has subsections).
  //
  // The original index is captured *before* the filter. An inline edit addresses
  // `history_culture.sections[n].content` by index, and one dropped empty entry
  // shifts every later section's rendered position down by one — so mapping over
  // the filtered list would aim each edit at the wrong stored section. The write
  // would be refused by the `expected` conflict check rather than silently
  // misapplied, but a reviewer would see nothing but unexplained refusals.
  const sections = (history_culture.sections ?? [])
    .map((section, originalIndex) => ({ section, originalIndex }))
    .filter(({ section }) => {
      const hasHeading = section.heading.trim().length > 0;
      const hasSectionContent = section.content.trim().length > 0;
      const hasSubsections = section.subsections && section.subsections.length > 0;
      return hasHeading && (hasSectionContent || hasSubsections);
    });

  // Nothing to show
  if (!hasContent && sections.length === 0) {
    return <ArticleGapNotice article={article} section="history_culture" />;
  }

  // Determine if we need truncation for the sections view
  // We truncate based on the first section's content
  const firstSection = sections[0];
  const needsSectionsTruncation = sections.length > 0 && (
    sections.length > 1 || // Multiple sections always truncate
    (firstSection && needsTruncation(firstSection.section.content)) || // First section content is long
    (firstSection?.section.subsections && firstSection.section.subsections.length > 0) // Has subsections
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
      icon={SUBSTANCE_SECTION_ICONS["history-culture"]}
      heading="History & Culture"
    >
      {hasContent && sections.length > 0 && (
        <p className="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">
          {/* This branch is never truncated, so the rendered text is the raw field. */}
          <EditableValue
            as="span"
            label="History & culture overview"
            path="history_culture.content"
            value={history_culture.content}
          >
            {renderHistoryText(history_culture.content, article)}
          </EditableValue>
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
            <p className="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">
              {/*
                Editable only while the whole field is on screen. `truncateContent`
                cuts mid-word, and an editor opening on the collapsed preview is
                one keystroke away from saving that preview over the article's
                real history. Expanding restores the raw value and the affordance.
              */}
              <EditableHistoryText
                editable={displayFreeformContent === content}
                label="History & culture overview"
                path="history_culture.content"
                value={content}
              >
                {renderHistoryText(displayFreeformContent, article)}
              </EditableHistoryText>
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
        const getDisplayContent = (content: string, displayIdx: number) => {
          if (!content.trim()) return "";
          // When collapsed and it's the first section, truncate
          if (!isExpanded && displayIdx === 0) {
            return truncateContent(content);
          }
          return content;
        };

        return (
          <>
            <div className="space-y-8">
              {/*
                `displayIdx` is the position in the rendered list and drives
                truncation; `originalIndex` is the position in the stored array
                and is the only one a field path may carry.
              */}
              {sectionsToShow.map(({ section, originalIndex }, displayIdx) => {
                const sectionIcon = getIconForHistoryHeading(section.heading);
                const hasSubsections = section.subsections && section.subsections.length > 0;
                const sectionHasContent = section.content.trim().length > 0;
                const displayContent = getDisplayContent(section.content, displayIdx);
                const isTruncated = !isExpanded && displayIdx === 0 && sectionHasContent && needsTruncation(section.content);

                return (
                  <section key={originalIndex} className="theme-section-group-divider">
                    <div>
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-dose-text">
                        <Icon icon={sectionIcon} size={20} className="theme-icon-accent" />
                        {section.heading}
                      </h3>
                      {sectionHasContent && (
                        <div className="relative">
                          <p className="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">
                            <EditableHistoryText
                              editable={displayContent === section.content}
                              label={`${section.heading} history content`}
                              path={buildFieldPath("history_culture", "sections", originalIndex, "content")}
                              value={section.content}
                            >
                              {renderHistoryText(displayContent, article)}
                            </EditableHistoryText>
                            {isTruncated && "…"}
                          </p>
                        </div>
                      )}

                      {/* Nested subsections - only show when expanded */}
                      {isExpanded && hasSubsections && (
                        section.heading === "Notable Individuals" ? (
                          // Special card-based layout for Notable Individuals.
                          // The whole card is a <button>, so the editor inside it
                          // relies on EditableValue stopping its own clicks from
                          // reaching the toggle.
                          <div className={`flex flex-col gap-2 ${sectionHasContent ? 'mt-4' : ''}`}>
                            {section.subsections!.map((sub, subIdx) => {
                              const key = `${originalIndex}-${subIdx}`;
                              return (
                                <NotableIndividualCard
                                  key={subIdx}
                                  article={article}
                                  name={sub.heading}
                                  content={sub.content}
                                  contentPath={buildFieldPath(
                                    "history_culture",
                                    "sections",
                                    originalIndex,
                                    "subsections",
                                    subIdx,
                                    "content",
                                  )}
                                  isExpanded={expandedIndividuals.has(key)}
                                  onToggle={() => toggleIndividual(key)}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          // Default nested subsection layout. Subsections are
                          // never filtered and never truncated, so `subIdx` is
                          // the stored index and the raw content is on screen.
                          <div className={`flex flex-col gap-3 ${sectionHasContent ? 'mt-4' : ''} pl-4`}>
                            {section.subsections!.map((sub, subIdx) => (
                              <div key={subIdx}>
                                <h4 className="mb-1 font-medium text-dose-text-secondary">
                                  {sub.heading}
                                </h4>
                                <p className="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">
                                  <EditableValue
                                    as="span"
                                    label={`${sub.heading} history content`}
                                    path={buildFieldPath(
                                      "history_culture",
                                      "sections",
                                      originalIndex,
                                      "subsections",
                                      subIdx,
                                      "content",
                                    )}
                                    value={sub.content}
                                  >
                                    {renderHistoryText(sub.content, article)}
                                  </EditableValue>
                                </p>
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
