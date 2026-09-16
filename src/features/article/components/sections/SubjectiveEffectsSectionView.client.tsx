"use client";

import { memo, useState, type ReactNode } from "react";
import { Icon } from "@/components/common/Icon";
import { SEIRoadmapNotice } from "@/components/common/SEIRoadmapNotice";
import type { SubstanceArticle } from "@/schema";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import {
  ArticleSection,
  ArticleSectionGroup,
} from "@/components/common/ArticleSection";
import { GuideLinkLine } from "@/features/articles/components/GuideLinkLine";
import {
  ARTICLE_GUIDES_BY_CLASS,
  buildSummaryCaption,
  resolveGuideClass,
  resolveSubstanceGuide,
} from "@/features/articles/domain/articleGuides";
import { slugify } from "@/utils/slug";
import { buildFieldPath } from "../../editing";
import {
  SUBJECTIVE_EFFECTS_STUB_MAX_EFFECTS,
  countVisibleEffects,
  getSubcategories,
  getSubcategoryData,
  hasEffects,
  hasSenseEffects,
} from "./subjectiveEffectsModel";
import {
  CategoryEffects,
  CollapsibleStage,
  SENSORY_CATEGORIES,
} from "./subjectiveEffectsShared";
import { msg, useT } from "@/i18n/client";

interface SubjectiveEffectsSectionViewProps {
  projection: Pick<
    SubstanceArticle,
    "subjective_effects" | "classification" | "title"
  >;
  /** Called when an effect badge is clicked */
  onSelectEffect?: (effect: string) => void;
  attributionSection?: ReactNode;
  overviewContent: ReactNode;
  physicalNoteContent?: ReactNode;
  cognitiveNoteContent?: ReactNode;
  sensoryNoteContent: Record<string, ReactNode>;
  comparisonsContent?: ReactNode;
  /**
   * Streamed Replication Showcase (a server-rendered slot), drawn as the final
   * content in Subjective Effects. Absent — the usual case — nothing changes.
   */
  replicationShowcaseSection?: ReactNode;
}

const effectFamilyGroupClassName = "theme-section-group-divider";
const effectFamilyHeadingClassName =
  "text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8";
const effectFamilyIconClassName = "scale-110";
const subjectiveEffectsStubText = msg(
  "This subjective effect section is a stub! Meaning it is very brief and potentially incomplete.",
);

/** Where each family's subcategory notes live. See `EffectNotePathBase`. */
const PHYSICAL_NOTE_PATH_BASE = ["subjective_effects", "physical"] as const;
const COGNITIVE_NOTE_PATH_BASE = ["subjective_effects", "cognitive"] as const;

export function SubjectiveEffectsOverviewFallback() {
  const t = useT();
  return <>{t("Effects vary widely by individual, dose, and context.")}</>;
}

export const SubjectiveEffectsSectionView = memo(
  function SubjectiveEffectsSectionView({
    projection,
    onSelectEffect,
    attributionSection,
    replicationShowcaseSection,
    overviewContent,
    physicalNoteContent,
    cognitiveNoteContent,
    sensoryNoteContent,
    comparisonsContent,
  }: SubjectiveEffectsSectionViewProps) {
    const t = useT();
    const { subjective_effects } = projection;
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
    const hasComparisons = Boolean(comparisonsContent);
    // section on the page; the computed verdict below decides the banner alone.
    const isFlaggedStub = subjective_effects.is_stub === true;

    // Check if any sensory category has effects
    const hasAnySensory = SENSORY_CATEGORIES.some(({ key }) =>
      hasSenseEffects(
        subjective_effects.sensory[
          key as keyof typeof subjective_effects.sensory
        ],
      ),
    );

    // Reached only when the section has something to render, so a computed stub
    // verdict can never paper a banner over an empty section — that case exits
    // above with the gap notice instead.
    const hasStubNotice =
      isFlaggedStub ||
      countVisibleEffects(subjective_effects) <=
        SUBJECTIVE_EFFECTS_STUB_MAX_EFFECTS;

    const guideClass = resolveGuideClass(
      projection.classification?.psychoactive_class ?? [],
    );
    const guides = guideClass ? ARTICLE_GUIDES_BY_CLASS[guideClass] : undefined;
    // The scale grades every substance in the class; the guide is offered only on
    // the page of the substance it is about. The article carries no slug field,
    // and its route slug is the slugified title (`Dextromethorphan` ->
    // `dextromethorphan`), which is what the guide names.
    const guideLine = guides ? (
      <GuideLinkLine
        scale={guides.scale}
        guide={resolveSubstanceGuide(guides, slugify(projection.title))}
        summaryCaption={buildSummaryCaption(t, guides)}
      />
    ) : null;

    return (
      <ArticleSection
        id="subjective-effects"
        icon={SUBSTANCE_SECTION_ICONS["subjective-effects"]}
        heading={t("Subjective Effects")}
      >
        {/* The roadmap note qualifies the whole section, and the stub notice
          qualifies everything below it, so both lead rather than trail the
          intro prose. */}
        <SEIRoadmapNotice />
        {hasStubNotice ? (
          <aside
            aria-label={t("Subjective effects stub notice")}
            role="note"
            className="theme-subjective-stub-panel backdrop-safe relative isolate flex items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-2 sm:px-4 sm:py-2.5"
          >
            <span className="theme-subjective-stub-icon grid size-9 shrink-0 place-items-center rounded-full border sm:size-10">
              <Icon icon="tabler:egg-cracked" size={22} className="shrink-0" />
            </span>
            {/* No max-width: the copy is one line on a normal article column, and
              the old 58ch cap wrapped it well before the container ran out. */}
            <p className="theme-subjective-stub-copy text-sm font-medium leading-6 [text-wrap:pretty]">
              {t(subjectiveEffectsStubText)}
            </p>
          </aside>
        ) : null}

        {overviewContent}

        {/* Full-width stacked layout: Physical, Cognitive, Visual, Auditory, other senses */}
        <div className="space-y-8">
          {/* Physical Effects */}
          {hasPhysical && (
            <ArticleSectionGroup
              heading={t("Physical")}
              icon="lucide:hand"
              spacing="loose"
              className={effectFamilyGroupClassName}
              headingClassName={effectFamilyHeadingClassName}
              iconClassName={effectFamilyIconClassName}
            >
              {physicalNoteContent}
              <CategoryEffects
                location="physical"
                category={subjective_effects.physical}
                expandedEffect={expandedEffect}
                notePathBase={PHYSICAL_NOTE_PATH_BASE}
                onToggleEffect={toggleEffect}
                onSelectEffect={onSelectEffect}
              />
            </ArticleSectionGroup>
          )}

          {/* Cognitive Effects */}
          {hasCognitive && (
            <ArticleSectionGroup
              heading={t("Cognitive")}
              icon="fluent:thinking-24-regular"
              spacing="loose"
              className={effectFamilyGroupClassName}
              headingClassName={effectFamilyHeadingClassName}
              iconClassName={effectFamilyIconClassName}
            >
              {cognitiveNoteContent}
              <CategoryEffects
                location="cognitive"
                category={subjective_effects.cognitive}
                expandedEffect={expandedEffect}
                notePathBase={COGNITIVE_NOTE_PATH_BASE}
                onToggleEffect={toggleEffect}
                onSelectEffect={onSelectEffect}
              />
            </ArticleSectionGroup>
          )}

          {/* Progressive Stages */}
          {hasProgressiveStages && subjective_effects.progressive_stages && (
            <ArticleSectionGroup
              heading={t("Progressive Stages")}
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
                        // Stage keys are article data — "1. Taking Off" carries a
                        // dot that would split the path — so the path is built,
                        // never interpolated.
                        notePath={buildFieldPath(
                          "subjective_effects",
                          "progressive_stages",
                          stageName,
                          "note",
                        )}
                        onToggle={() => toggleEffect(stageName)}
                      />
                    );
                  },
                )}
              </div>
            </ArticleSectionGroup>
          )}

          {/* Sensory categories - Visual, Auditory, then others */}
          {SENSORY_CATEGORIES.map(
            ({ key, label: rawLabel, icon: senseIcon }) => {
              const label = t(rawLabel);
              const senseCategory =
                subjective_effects.sensory[
                  key as keyof typeof subjective_effects.sensory
                ];
              if (!hasSenseEffects(senseCategory)) return null;

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
                  {sensoryNoteContent[key]}
                  <CategoryEffects
                    location={`sensory.${key}`}
                    category={senseCategory.subcategories}
                    expandedEffect={expandedEffect}
                    notePathBase={[
                      "subjective_effects",
                      "sensory",
                      key,
                      "subcategories",
                    ]}
                    onToggleEffect={toggleEffect}
                    onSelectEffect={onSelectEffect}
                  />
                </ArticleSectionGroup>
              );
            },
          )}

          {/* Comparisons */}
          {hasComparisons && (
            <ArticleSectionGroup
              heading={t("Comparisons")}
              icon="lucide:git-compare-arrows"
              spacing="loose"
              className={effectFamilyGroupClassName}
              headingClassName={effectFamilyHeadingClassName}
              iconClassName={effectFamilyIconClassName}
            >
              {comparisonsContent}
            </ArticleSectionGroup>
          )}
        </div>

        {attributionSection}

        {/* Further reading closes the section: it points away from the page, so
          it belongs after the effects and their credit rather than above the
          prose. The roadmap note stays at the top, where it qualifies
          everything below it. */}
        {guideLine}

        {replicationShowcaseSection ?? null}
      </ArticleSection>
    );
  },
);
