"use client";

import { memo, useState } from "react";
import { ExpandableText } from "@/components/common/ArticleExpandable";
import { ArticleContributorAttribution } from "@/components/layout/PublicFeedbackPrimitives";
import { Icon } from "@/components/common/Icon";
import type { SubstanceArticle } from "@/schema";
import { icons } from "@/utils/iconNames";
import { getContributorPath } from "@/utils/contributors";
import {
  ArticleSection,
  ArticleSectionGroup,
} from "@/components/common/ArticleSection";
import { ArticleText } from "../CitedText";
import {
  CollapsibleStage,
  SENSORY_CATEGORIES,
  SubcategorySection,
  getSubcategories,
  getSubcategoryData,
  hasEffects,
  hasSenseEffects,
  truncateOverviewText,
} from "./subjectiveEffectsShared";

interface SubjectiveEffectsSectionProps {
  article: SubstanceArticle;
  /** Called when an effect badge is clicked */
  onSelectEffect?: (effect: string) => void;
}

const effectFamilyGroupClassName =
  "theme-section-group-divider";
const effectFamilyHeadingClassName =
  "text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8";
const effectFamilyIconClassName = "scale-110";
const subjectiveEffectsStubText =
  "This subjective effect section is a stub! Meaning it is very brief and potentially incomplete.";

function isArchivedSubjectiveEffectsAttribution({
  author,
  url,
}: {
  author: string;
  url?: string;
}) {
  return (
    author === "Josie Kins" &&
    typeof url === "string" &&
    url.startsWith("https://web.archive.org/web/")
  );
}

export const SubjectiveEffectsSection = memo(function SubjectiveEffectsSection({
  article,
  onSelectEffect,
}: SubjectiveEffectsSectionProps) {
  const { subjective_effects, comparisons } = article;

  // Track which effect is currently expanded (only one at a time across all categories)
  const [expandedEffect, setExpandedEffect] = useState<string | null>(null);

  const toggleEffect = (effectName: string) => {
    setExpandedEffect((prev) => (prev === effectName ? null : effectName));
  };

  const hasCognitive = hasEffects(subjective_effects.cognitive);
  const hasPhysical = hasEffects(subjective_effects.physical);
  const hasProgressiveStages = hasEffects(
    subjective_effects.progressive_stages,
  );
  const hasComparisons = comparisons && comparisons.length > 0;
  const hasOverviewNote = subjective_effects.notes?.overview?.trim().length > 0;
  const hasStubNotice = subjective_effects.is_stub === true;
  const hasCognitiveNote =
    subjective_effects.notes?.cognitive?.trim().length > 0;
  const hasPhysicalNote = subjective_effects.notes?.physical?.trim().length > 0;

  // Check if any sensory category has effects
  const hasAnySensory = SENSORY_CATEGORIES.some(({ key }) =>
    hasSenseEffects(
      subjective_effects.sensory[
        key as keyof typeof subjective_effects.sensory
      ],
    ),
  );

  const overviewText = hasOverviewNote
    ? subjective_effects.notes.overview.trim()
    : "Effects vary widely by individual, dose, and context.";
  const canCollapseOverview =
    hasOverviewNote && truncateOverviewText(overviewText) !== overviewText;

  if (
    !hasAnySensory &&
    !hasCognitive &&
    !hasPhysical &&
    !hasProgressiveStages &&
    !hasComparisons &&
    !hasOverviewNote &&
    !hasStubNotice
  ) {
    return null;
  }

  return (
    <ArticleSection
      id="subjective-effects"
      icon={icons.subjectiveEffectIndex}
      heading="Subjective Effects"
    >
      {/* Overview note as intro paragraph, or fallback to generic text */}
      {canCollapseOverview ? (
        <ExpandableText
          ariaLabelBase="subjective effects overview"
          contentClassName="theme-text-secondary text-sm leading-relaxed"
          maxLines={4}
        >
          {overviewText}
        </ExpandableText>
      ) : (
        <ArticleText cited={false} tone="muted">
          {overviewText}
        </ArticleText>
      )}

      {hasStubNotice ? (
        <aside
          aria-label="Subjective effects stub notice"
          role="note"
          className="group relative isolate overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--theme-semantic-caution-badge-border)_76%,var(--theme-border-subtle))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--theme-semantic-caution-badge-bg)_80%,var(--theme-frosted-control-on-panel-bg))_0%,color-mix(in_srgb,var(--theme-accent)_8%,var(--theme-surface-soft))_100%)] px-3.5 py-3 shadow-[var(--theme-frosted-control-on-panel-shadow)] sm:px-4"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-[color:var(--theme-semantic-caution-badge-border)] bg-[color:var(--theme-semantic-caution-badge-bg)] text-[color:var(--theme-semantic-caution-badge-text)] shadow-[var(--theme-status-badge-shadow)]">
              <Icon icon="tabler:egg-cracked" size={17} className="shrink-0" />
            </span>
            <p className="theme-text-secondary max-w-[68ch] text-sm leading-relaxed">
              {subjectiveEffectsStubText}
            </p>
          </div>
        </aside>
      ) : null}

      {/* Full-width stacked layout: Physical, Cognitive, Visual, Auditory, other senses */}
      <div className="space-y-8">
        {/* Physical Effects */}
        {hasPhysical && (
          <ArticleSectionGroup
            heading="Physical"
            icon="lucide:hand"
            spacing="loose"
            className={effectFamilyGroupClassName}
            headingClassName={effectFamilyHeadingClassName}
            iconClassName={effectFamilyIconClassName}
          >
            {hasPhysicalNote && (
              <p className="theme-text-muted text-sm leading-relaxed">
                {subjective_effects.notes.physical}
              </p>
            )}
            <div className="space-y-4">
              {getSubcategories(subjective_effects.physical).map(
                (subcategory) => (
                  <SubcategorySection
                    key={subcategory}
                    subcategory={subcategory}
                    subcategoryData={getSubcategoryData(
                      subjective_effects.physical,
                      subcategory,
                    )}
                    expandedEffect={expandedEffect}
                    onToggleEffect={toggleEffect}
                    onSelectEffect={onSelectEffect}
                    isGeneral={subcategory === "General"}
                  />
                ),
              )}
            </div>
          </ArticleSectionGroup>
        )}

        {/* Cognitive Effects */}
        {hasCognitive && (
          <ArticleSectionGroup
            heading="Cognitive"
            icon="fluent:thinking-24-regular"
            spacing="loose"
            className={effectFamilyGroupClassName}
            headingClassName={effectFamilyHeadingClassName}
            iconClassName={effectFamilyIconClassName}
          >
            {hasCognitiveNote && (
              <p className="theme-text-muted text-sm leading-relaxed">
                {subjective_effects.notes.cognitive}
              </p>
            )}
            <div className="space-y-4">
              {getSubcategories(subjective_effects.cognitive).map(
                (subcategory) => (
                  <SubcategorySection
                    key={subcategory}
                    subcategory={subcategory}
                    subcategoryData={getSubcategoryData(
                      subjective_effects.cognitive,
                      subcategory,
                    )}
                    expandedEffect={expandedEffect}
                    onToggleEffect={toggleEffect}
                    onSelectEffect={onSelectEffect}
                    isGeneral={subcategory === "General"}
                  />
                ),
              )}
            </div>
          </ArticleSectionGroup>
        )}

        {/* Progressive Stages */}
        {hasProgressiveStages && subjective_effects.progressive_stages && (
          <ArticleSectionGroup
            heading="Progressive Stages"
            icon="lucide:list-ordered"
            spacing="loose"
            className={effectFamilyGroupClassName}
            headingClassName={effectFamilyHeadingClassName}
            iconClassName={effectFamilyIconClassName}
          >
            <div>
              {getSubcategories(subjective_effects.progressive_stages).map(
                (stageName) => {
                  const stageData = getSubcategoryData(
                    subjective_effects.progressive_stages!,
                    stageName,
                  );
                  return (
                    <CollapsibleStage
                      key={stageName}
                      name={stageName}
                      note={stageData.note}
                      isExpanded={expandedEffect === stageName}
                      onToggle={() => toggleEffect(stageName)}
                    />
                  );
                },
              )}
            </div>
          </ArticleSectionGroup>
        )}

        {/* Sensory categories - Visual, Auditory, then others */}
        {SENSORY_CATEGORIES.map(({ key, label, icon: senseIcon }) => {
          const senseCategory =
            subjective_effects.sensory[
              key as keyof typeof subjective_effects.sensory
            ];
          if (!hasSenseEffects(senseCategory)) return null;

          const subcategories = getSubcategories(senseCategory.subcategories);
          const hasSenseNote = senseCategory.note?.trim().length > 0;

          return (
            <ArticleSectionGroup
              key={key}
              heading={label}
              icon={senseIcon ?? undefined}
              spacing="loose"
              className={effectFamilyGroupClassName}
              headingClassName={effectFamilyHeadingClassName}
              iconClassName={effectFamilyIconClassName}
            >
              {hasSenseNote && (
                <p className="theme-text-muted text-sm leading-relaxed">
                  {senseCategory.note}
                </p>
              )}
              <div className="space-y-4">
                {subcategories.map((subcategory) => (
                  <SubcategorySection
                    key={subcategory}
                    subcategory={subcategory}
                    subcategoryData={getSubcategoryData(
                      senseCategory.subcategories,
                      subcategory,
                    )}
                    expandedEffect={expandedEffect}
                    onToggleEffect={toggleEffect}
                    onSelectEffect={onSelectEffect}
                    isGeneral={subcategory === "General"}
                  />
                ))}
              </div>
            </ArticleSectionGroup>
          );
        })}

        {/* Comparisons */}
        {hasComparisons && (
          <ArticleSectionGroup
            heading="Comparisons"
            icon="lucide:git-compare-arrows"
            spacing="loose"
            className={effectFamilyGroupClassName}
            headingClassName={effectFamilyHeadingClassName}
            iconClassName={effectFamilyIconClassName}
          >
            <ul className="space-y-3">
              {comparisons.map((item, idx) => (
                <li key={idx} className="text-sm leading-relaxed">
                  <span className="theme-accent-heading font-medium">
                    {item.drug}
                  </span>
                  <span className="theme-text-faint"> — </span>
                  <span className="theme-text-secondary">{item.comparison}</span>
                </li>
              ))}
            </ul>
          </ArticleSectionGroup>
        )}
      </div>

      {/* Attribution Banner */}
      {subjective_effects.attribution &&
        (() => {
          const { author, text, url } = subjective_effects.attribution;
          const contributorPath = isArchivedSubjectiveEffectsAttribution({
            author,
            url,
          })
            ? url
            : getContributorPath(author);

          return (
            <ArticleContributorAttribution
              className="mt-4"
              author={author}
              authorHref={contributorPath}
              avatarSrc={
                author === "Josie Kins"
                  ? "/profile-avatars/josie/avatar.webp"
                  : undefined
              }
              text={text}
              url={url}
            />
          );
        })()}
    </ArticleSection>
  );
});
