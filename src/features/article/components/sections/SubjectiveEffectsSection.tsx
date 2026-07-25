"use client";

import { memo, useState } from "react";
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
  CategoryEffects,
  CollapsibleStage,
  SENSORY_CATEGORIES,
  SUBJECTIVE_EFFECTS_STUB_MAX_EFFECTS,
  countVisibleEffects,
  getSubcategories,
  getSubcategoryData,
  hasEffects,
  hasSenseEffects,
} from "./subjectiveEffectsShared";
import { ArticleGapNotice } from "./ArticleGapNotice";

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
  // The stored flag is the only thing that can keep an otherwise contentless
  // section on the page; the computed verdict below decides the banner alone.
  const isFlaggedStub = subjective_effects.is_stub === true;
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

  if (
    !hasAnySensory &&
    !hasCognitive &&
    !hasPhysical &&
    !hasProgressiveStages &&
    !hasComparisons &&
    !hasOverviewNote &&
    !isFlaggedStub
  ) {
    return <ArticleGapNotice article={article} section="subjective_effects" />;
  }

  // Reached only when the section has something to render, so a computed stub
  // verdict can never paper a banner over an empty section — that case exits
  // above with the gap notice instead.
  const hasStubNotice =
    isFlaggedStub ||
    countVisibleEffects(subjective_effects) <= SUBJECTIVE_EFFECTS_STUB_MAX_EFFECTS;

  return (
    <ArticleSection
      id="subjective-effects"
      icon={icons.subjectiveEffectIndex}
      heading="Subjective Effects"
    >
      {/* The stub notice qualifies everything below it, so it leads the section
          rather than trailing the intro prose. */}
      {hasStubNotice ? (
        <aside
          aria-label="Subjective effects stub notice"
          role="note"
          className="theme-subjective-stub-panel backdrop-safe relative isolate flex items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-2 sm:px-4 sm:py-2.5"
        >
          <span className="theme-subjective-stub-icon grid size-9 shrink-0 place-items-center rounded-full border sm:size-10">
            <Icon icon="tabler:egg-cracked" size={22} className="shrink-0" />
          </span>
          {/* No max-width: the copy is one line on a normal article column, and
              the old 58ch cap wrapped it well before the container ran out. */}
          <p className="theme-subjective-stub-copy text-sm font-medium leading-6 [text-wrap:pretty]">
            {subjectiveEffectsStubText}
          </p>
        </aside>
      ) : null}

      {/* Overview note as intro paragraph, or fallback to generic text */}
      <ArticleText cited={false} tone="muted">
        {overviewText}
      </ArticleText>

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
            <CategoryEffects
              category={subjective_effects.physical}
              expandedEffect={expandedEffect}
              onToggleEffect={toggleEffect}
              onSelectEffect={onSelectEffect}
            />
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
            <CategoryEffects
              category={subjective_effects.cognitive}
              expandedEffect={expandedEffect}
              onToggleEffect={toggleEffect}
              onSelectEffect={onSelectEffect}
            />
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
              <CategoryEffects
                category={senseCategory.subcategories}
                expandedEffect={expandedEffect}
                onToggleEffect={toggleEffect}
                onSelectEffect={onSelectEffect}
              />
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

      {/* Attribution Banner — AI generation is the default, so the pipeline's
          self-attribution is redundant; only human contributors get credit. */}
      {subjective_effects.attribution &&
        !/\bAI editorial pipeline\b/i.test(subjective_effects.attribution.author) &&
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
