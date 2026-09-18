"use client";

import { memo, useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import {
  ArticleSection,
  ArticleSubsectionCard,
} from "@/components/common/ArticleSection";
import { articleSectionAdornmentClassName } from "@/components/common/articleSectionLayout";
import { cn } from "@/lib/utils";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { useT } from "@/i18n/client";
import type {
  HistoryCultureViewModel,
  HistorySubsectionViewModel,
} from "./historyCultureModel";

function NotableIndividualCard({
  individual,
  isExpanded,
  onToggle,
}: {
  individual: HistorySubsectionViewModel;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <ArticleSubsectionCard
      asChild
      variant="interactive"
      padding="xs"
      className="w-full rounded-lg text-left"
    >
      <button type="button" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="theme-author-avatar-placeholder theme-public-card-subtle flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border">
            <Icon icon="lucide:user" size={20} className="theme-icon-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="theme-text-primary truncate font-medium">
              {individual.heading}
            </span>
          </div>
          <Icon
            icon="lucide:chevron-down"
            size={16}
            className={`theme-icon-muted flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </div>
        {isExpanded && (
          <>
            <div className="theme-horizontal-divider mb-3 mt-3" />
            <p className="theme-text-secondary whitespace-pre-wrap text-sm leading-relaxed">
              {individual.content}
            </p>
          </>
        )}
      </button>
    </ArticleSubsectionCard>
  );
}

export const HistoryCultureSectionView = memo(
  function HistoryCultureSectionView({
    model,
  }: {
    model: HistoryCultureViewModel;
  }) {
    const t = useT();
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedIndividuals, setExpandedIndividuals] = useState<Set<string>>(
      new Set(),
    );

    const toggleIndividual = (key: string) => {
      setExpandedIndividuals((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    return (
      <ArticleSection
        id="history-culture"
        icon={SUBSTANCE_SECTION_ICONS["history-culture"]}
        heading={t("History & Culture")}
      >
        {model.overview && (
          <p className="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">
            {model.overview}
          </p>
        )}

        {model.freeform && (
          <>
            <p className="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">
              {isExpanded
                ? model.freeform.fullContent
                : model.freeform.collapsedContent}
              {model.freeform.isTruncated && !isExpanded && "…"}
            </p>
            {model.freeform.isTruncated && (
              <div
                className={cn(
                  "flex justify-center",
                  articleSectionAdornmentClassName,
                )}
              >
                <ExpandButton
                  isExpanded={isExpanded}
                  onToggle={() => setIsExpanded(!isExpanded)}
                  ariaLabel={
                    isExpanded
                      ? t("Collapse history and culture")
                      : t("Expand history and culture")
                  }
                />
              </div>
            )}
          </>
        )}

        {model.sections.length > 0 && (
          <>
            <div className="space-y-8">
              {(isExpanded ? model.sections : model.sections.slice(0, 1)).map(
                (section, displayIndex) => {
                  const sectionHasContent = section.hasContent;
                  const isTruncated =
                    !isExpanded &&
                    displayIndex === 0 &&
                    section.isCollapsedTruncated;

                  return (
                    <section
                      key={section.id}
                      className="theme-section-group-divider"
                    >
                      <div>
                        <h3 className="mb-3 flex items-center gap-2 font-semibold text-dose-text">
                          <Icon
                            icon={section.icon}
                            size={20}
                            className="theme-icon-accent"
                          />
                          {section.heading}
                        </h3>
                        {sectionHasContent && (
                          <div className="relative">
                            <p className="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">
                              {isExpanded
                                ? section.fullContent
                                : section.collapsedContent}
                              {isTruncated && "…"}
                            </p>
                          </div>
                        )}

                        {isExpanded &&
                          section.subsections.length > 0 &&
                          (section.isNotableIndividuals ? (
                            <div
                              className={`flex flex-col gap-2 ${sectionHasContent ? "mt-4" : ""}`}
                            >
                              {section.subsections.map((individual) => (
                                <NotableIndividualCard
                                  key={individual.id}
                                  individual={individual}
                                  isExpanded={expandedIndividuals.has(
                                    individual.id,
                                  )}
                                  onToggle={() =>
                                    toggleIndividual(individual.id)
                                  }
                                />
                              ))}
                            </div>
                          ) : (
                            <div
                              className={`flex flex-col gap-3 ${sectionHasContent ? "mt-4" : ""} pl-4`}
                            >
                              {section.subsections.map((subsection) => (
                                <div key={subsection.id}>
                                  <h4 className="mb-1 font-medium text-dose-text-secondary">
                                    {subsection.heading}
                                  </h4>
                                  <p className="text-sm text-dose-text-secondary whitespace-pre-wrap leading-relaxed">
                                    {subsection.content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ))}
                      </div>
                    </section>
                  );
                },
              )}
            </div>

            {model.sectionsNeedTruncation && (
              <div
                className={cn(
                  "flex justify-center",
                  articleSectionAdornmentClassName,
                )}
              >
                <ExpandButton
                  isExpanded={isExpanded}
                  onToggle={() => setIsExpanded(!isExpanded)}
                  ariaLabel={
                    isExpanded
                      ? t("Collapse history and culture")
                      : t("Expand history and culture")
                  }
                />
              </div>
            )}
          </>
        )}
      </ArticleSection>
    );
  },
);
