import Link from "next/link";
import { memo, useState } from "react";
import { AppImage } from "@/components/common/AppImage";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { SubstanceArticle } from "@/schema";
import { getContributorPath } from "@/utils/contributors";
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

export const SubjectiveEffectsSection = memo(function SubjectiveEffectsSection({
  article,
  onSelectEffect,
}: SubjectiveEffectsSectionProps) {
  const { subjective_effects, comparisons } = article;

  // Track which effect is currently expanded (only one at a time across all categories)
  const [expandedEffect, setExpandedEffect] = useState<string | null>(null);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);

  const toggleEffect = (effectName: string) => {
    setExpandedEffect((prev) => (prev === effectName ? null : effectName));
  };

  const hasCognitive = hasEffects(subjective_effects.cognitive);
  const hasPhysical = hasEffects(subjective_effects.physical);
  const hasProgressiveStages = hasEffects(subjective_effects.progressive_stages);
  const hasComparisons = comparisons && comparisons.length > 0;
  const hasOverviewNote = subjective_effects.notes?.overview?.trim().length > 0;
  const hasCognitiveNote = subjective_effects.notes?.cognitive?.trim().length > 0;
  const hasPhysicalNote = subjective_effects.notes?.physical?.trim().length > 0;

  // Check if any sensory category has effects
  const hasAnySensory = SENSORY_CATEGORIES.some(
    ({ key }) => hasSenseEffects(subjective_effects.sensory[key as keyof typeof subjective_effects.sensory])
  );

  const overviewText = hasOverviewNote
    ? subjective_effects.notes.overview.trim()
    : "Effects vary widely by individual, dose, and context.";
  const canCollapseOverview =
    hasOverviewNote && truncateOverviewText(overviewText) !== overviewText;
  const displayedOverviewText = canCollapseOverview && !isOverviewExpanded
    ? truncateOverviewText(overviewText)
    : overviewText;

  if (!hasAnySensory && !hasCognitive && !hasPhysical && !hasProgressiveStages && !hasComparisons && !hasOverviewNote) {
    return null;
  }

  return (
    <div id="subjective-effects" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="lucide:sparkles" title="Subjective Effects" />

      {/* Overview note as intro paragraph, or fallback to generic text */}
      <div className="space-y-2">
        <p className="text-sm text-white/80 leading-relaxed">
          {displayedOverviewText}
          {canCollapseOverview && !isOverviewExpanded && "…"}
        </p>
        {canCollapseOverview && (
          <div className="flex justify-start">
            <ExpandButton
              isExpanded={isOverviewExpanded}
              onToggle={() => setIsOverviewExpanded((expanded) => !expanded)}
              ariaLabel={isOverviewExpanded ? "Collapse subjective effects overview" : "Expand subjective effects overview"}
            />
          </div>
        )}
      </div>

      {/* Full-width stacked layout: Physical, Cognitive, Visual, Auditory, other senses */}
      <div className="space-y-4">
        {/* Physical Effects Card */}
        {hasPhysical && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Icon icon="lucide:hand" size={16} className="text-fuchsia-200" />
              Physical
            </h3>
            {hasPhysicalNote && (
              <p className="mb-4 text-sm text-white/60 leading-relaxed">
                {subjective_effects.notes.physical}
              </p>
            )}
            <div className="space-y-4">
              {getSubcategories(subjective_effects.physical).map((subcategory) => (
                <SubcategorySection
                  key={subcategory}
                  subcategory={subcategory}
                  subcategoryData={getSubcategoryData(subjective_effects.physical, subcategory)}
                  expandedEffect={expandedEffect}
                  onToggleEffect={toggleEffect}
                  onSelectEffect={onSelectEffect}
                  isGeneral={subcategory === "General"}
                />
              ))}
            </div>
          </div>
        )}

        {/* Cognitive Effects Card */}
        {hasCognitive && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Icon icon="fluent:thinking-24-regular" size={20} className="text-fuchsia-200" />
              Cognitive
            </h3>
            {hasCognitiveNote && (
              <p className="mb-4 text-sm text-white/60 leading-relaxed">
                {subjective_effects.notes.cognitive}
              </p>
            )}
            <div className="space-y-4">
              {getSubcategories(subjective_effects.cognitive).map((subcategory) => (
                <SubcategorySection
                  key={subcategory}
                  subcategory={subcategory}
                  subcategoryData={getSubcategoryData(subjective_effects.cognitive, subcategory)}
                  expandedEffect={expandedEffect}
                  onToggleEffect={toggleEffect}
                  onSelectEffect={onSelectEffect}
                  isGeneral={subcategory === "General"}
                />
              ))}
            </div>
          </div>
        )}

        {/* Progressive Stages Card */}
        {hasProgressiveStages && subjective_effects.progressive_stages && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Icon icon="lucide:list-ordered" size={16} className="text-fuchsia-200" />
              Progressive Stages
            </h3>
            <div className="space-y-2">
              {getSubcategories(subjective_effects.progressive_stages).map((stageName) => {
                const stageData = getSubcategoryData(subjective_effects.progressive_stages!, stageName);
                return (
                  <CollapsibleStage
                    key={stageName}
                    name={stageName}
                    note={stageData.note}
                    isExpanded={expandedEffect === stageName}
                    onToggle={() => toggleEffect(stageName)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Sensory Cards - Visual, Auditory, then others */}
        {SENSORY_CATEGORIES.map(({ key, label, icon: senseIcon }) => {
          const senseCategory = subjective_effects.sensory[key as keyof typeof subjective_effects.sensory];
          if (!hasSenseEffects(senseCategory)) return null;

          const subcategories = getSubcategories(senseCategory.subcategories);
          const hasSenseNote = senseCategory.note?.trim().length > 0;

          return (
            <div key={key} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                {senseIcon && <Icon icon={senseIcon} size={20} className="text-fuchsia-200" />}
                {label}
              </h3>
              {hasSenseNote && (
                <p className="mb-4 text-sm text-white/60 leading-relaxed">
                  {senseCategory.note}
                </p>
              )}
              <div className="space-y-4">
                {subcategories.map((subcategory) => (
                  <SubcategorySection
                    key={subcategory}
                    subcategory={subcategory}
                    subcategoryData={getSubcategoryData(senseCategory.subcategories, subcategory)}
                    expandedEffect={expandedEffect}
                    onToggleEffect={toggleEffect}
                    onSelectEffect={onSelectEffect}
                    isGeneral={subcategory === "General"}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparisons Card - full width below grid */}
      {hasComparisons && (
        <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
            <Icon icon="lucide:git-compare-arrows" size={20} className="text-fuchsia-200" />
            Comparisons
          </h3>
          <ul className="space-y-2">
            {comparisons.map((item, idx) => (
              <li key={idx} className="text-sm">
                <span className="font-medium text-fuchsia-300">{item.drug}</span>
                <span className="text-white/50"> — </span>
                <span className="text-white/80">{item.comparison}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Attribution Banner */}
      {subjective_effects.attribution && (() => {
        const { author, text, url } = subjective_effects.attribution;
        const authorIndex = text.indexOf(author);
        const beforeAuthor = authorIndex > 0 ? text.slice(0, authorIndex) : "";
        const afterAuthor = authorIndex >= 0 ? text.slice(authorIndex + author.length) : text;
        const contributorPath = getContributorPath(author);

        return (
          <div className="mt-4 flex justify-end">
            <div className="flex flex-wrap items-center justify-end gap-2.5 rounded-2xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/10 transition hover:bg-white/[0.06] hover:ring-fuchsia-400/30">
              {author === "Josie Kins" && (
                <Link
                  href={contributorPath}
                  className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <AppImage
                    src="/profile-avatars/josie/avatar.webp"
                    alt="Josie Kins"
                    width={24}
                    height={24}
                    className="h-6 w-6 rounded-full object-cover ring-1 ring-white/20 hover:ring-fuchsia-400/50 transition"
                  />
                </Link>
              )}
              <span className="text-xs text-white/50">
                {beforeAuthor}
                <Link
                  href={contributorPath}
                  className="font-semibold text-white/70 transition hover:text-fuchsia-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  {author}
                </Link>
                {afterAuthor}
              </span>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-fuchsia-300 transition hover:text-fuchsia-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
              >
                <Icon icon="lucide:external-link" size={14} className="theme-external-link-badge-icon text-white/40" />
                <span>Original article</span>
              </a>
            </div>
          </div>
        );
      })()}
    </div>
  );
});
