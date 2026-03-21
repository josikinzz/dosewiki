import Link from "next/link";
import { memo, useState } from "react";
import { AppImage } from "@/components/common/AppImage";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import { cn } from "@/lib/utils";
import type { SubstanceArticle, EffectCategory, EffectEntry, SenseCategory } from "@/schema";
import { getContributorPath } from "@/utils/contributors";
import { isPlainLeftClick } from "@/utils/navigation";
import { slugify } from "@/utils/slug";

interface SubjectiveEffectsSectionProps {
  article: SubstanceArticle;
  /** Called when an effect badge is clicked */
  onSelectEffect?: (effect: string) => void;
}

const SENSORY_CATEGORIES = [
  { key: "visual", label: "Visual", icon: "line-md:watch-loop" as IconName },
  { key: "auditory", label: "Auditory", icon: "lucide:ear" as IconName },
  { key: "tactile", label: "Tactile", icon: "lucide:hand" as IconName },
  { key: "olfactory", label: "Olfactory", icon: null },
  { key: "gustatory", label: "Gustatory", icon: null },
  { key: "multisensory", label: "Multisensory", icon: null },
] as const;

/** Icons for specific subcategory names */
const SUBCATEGORY_ICONS: Record<string, IconName> = {
  "Enhancements": "lucide:arrow-up",
  "Suppressions": "lucide:arrow-down",
  "Distortions": "icon-park-outline:distortion",
  "Geometry": "lucide:shapes",
  "Hallucinatory States": "custom:elf",
  "1. Taking Off": "lucide:trending-up",
  "2. The Waiting Room": "lucide:loader",
  "3. The Other Side": "lucide:house",
  "4. Coming Down": "lucide:trending-down",
};

const OVERVIEW_COLLAPSE_LENGTH = 280;

function getEffectHref(name: string) {
  return `/effects/${slugify(name)}`;
}

function truncateOverviewText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= OVERVIEW_COLLAPSE_LENGTH) return trimmed;

  const truncated = trimmed.slice(0, OVERVIEW_COLLAPSE_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > OVERVIEW_COLLAPSE_LENGTH * 0.7 ? truncated.slice(0, lastSpace) : truncated).trimEnd();
}

/** Check if an effect category has any effects or notes */
function hasEffects(category: EffectCategory | undefined): boolean {
  if (!category || typeof category !== "object") return false;
  return Object.values(category).some(
    (sub) => sub && (
      (Array.isArray(sub.effects) && sub.effects.length > 0) ||
      (sub.note?.trim().length > 0)
    )
  );
}

/** Check if a sense category has any effects */
function hasSenseEffects(senseCategory: SenseCategory | undefined): boolean {
  if (!senseCategory) return false;
  return hasEffects(senseCategory.subcategories);
}

/** Get all subcategory names from an effect category (includes subcategories with notes even if no effects) */
function getSubcategories(category: EffectCategory | undefined): string[] {
  if (!category || typeof category !== "object") return [];
  return Object.keys(category).filter(
    (key) => category[key] && (
      (Array.isArray(category[key].effects) && category[key].effects.length > 0) ||
      category[key].note?.trim().length > 0
    )
  );
}

/** Get subcategory data (note + effects) */
function getSubcategoryData(
  category: EffectCategory | undefined,
  subcategory: string
): { note: string; effects: EffectEntry[] } {
  if (!category || !category[subcategory]) return { note: "", effects: [] };
  return category[subcategory];
}

/** Expandable effect badge component - expands inline to show description */
function EffectBadge({
  effect,
  isExpanded,
  onToggle,
  onSelectEffect,
}: {
  effect: EffectEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectEffect?: (name: string) => void;
}) {
  const hasDescription = effect.description?.trim().length > 0;
  const href = getEffectHref(effect.name);

  const handleClick = () => {
    if (hasDescription) {
      onToggle();
    } else if (onSelectEffect) {
      onSelectEffect(slugify(effect.name));
    }
  };

  // When expanded, the badge grows to show the description inline
  if (isExpanded && hasDescription) {
    // Check if description starts with (something) - and extract it as a subtitle badge
    const parenMatch = effect.description.match(/^\(([^)]+)\)\s*[-–—]\s*/);
    const subtitleBadge = parenMatch ? parenMatch[1] : null;
    const descriptionText = parenMatch
      ? effect.description.slice(parenMatch[0].length)
      : effect.description;

    return (
      <div
        className={cn(
          "relative flex flex-col items-start gap-3 rounded-lg px-4 py-4 text-left transition",
          "theme-inline-expanded-card",
          "w-full my-2"
        )}
      >
        <ExpandButton
          isExpanded={true}
          onToggle={onToggle}
          variant="compact"
          className="absolute top-3 right-3 text-white/85"
          ariaLabel={`Collapse ${effect.name}`}
        />
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <Link
            href={href}
            onClick={
              onSelectEffect
                ? (event) => {
                    if (!isPlainLeftClick(event)) {
                      return;
                    }

                    event.preventDefault();
                    onSelectEffect(slugify(effect.name));
                  }
                : undefined
            }
            className="text-xs font-semibold text-white/85 transition-colors hover:text-fuchsia-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
          >
            {effect.name}
          </Link>
          {subtitleBadge && (
            <span className="text-xs text-white/50 bg-white/10 px-2 py-0.5 rounded">
              {subtitleBadge}
            </span>
          )}
        </div>
        <p className="text-sm text-white/60 leading-relaxed">
          {descriptionText}
        </p>
      </div>
    );
  }

  // Collapsed state - compact badge
  if (!hasDescription) {
    return (
      <Link
        href={href}
        onClick={
          onSelectEffect
            ? (event) => {
                if (!isPlainLeftClick(event)) {
                  return;
                }

                event.preventDefault();
                handleClick();
              }
            : undefined
        }
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition",
          "bg-white/[0.03] text-white/85 ring-1 ring-white/10",
          "hover:bg-white/10 hover:text-fuchsia-200",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
        )}
      >
        {effect.name}
      </Link>
    );
  }

  return (
    <ExpandButton
      isExpanded={false}
      onToggle={handleClick}
      variant="badge"
      ariaLabel={`Expand ${effect.name}`}
    >
      {effect.name}
    </ExpandButton>
  );
}

/** Renders a group of effects with horizontal flow and inline-expandable badges */
function EffectsGroup({
  effects,
  expandedEffect,
  onToggleEffect,
  onSelectEffect,
}: {
  effects: EffectEntry[];
  expandedEffect: string | null;
  onToggleEffect: (name: string) => void;
  onSelectEffect?: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {effects.map((effect) => (
        <EffectBadge
          key={effect.name}
          effect={effect}
          isExpanded={expandedEffect === effect.name}
          onToggle={() => onToggleEffect(effect.name)}
          onSelectEffect={onSelectEffect}
        />
      ))}
    </div>
  );
}

/** Collapsible stage component for progressive stages */
function CollapsibleStage({
  name,
  note,
  isExpanded,
  onToggle,
}: {
  name: string;
  note: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const stageIcon = SUBCATEGORY_ICONS[name];
  const hasIcon = !!stageIcon;

  return (
    <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/5 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between gap-2 p-3 text-left transition",
          !isExpanded && "hover:bg-white/[0.03]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400"
        )}
      >
        <div className="flex items-center gap-2">
          {hasIcon && <Icon icon={stageIcon} size={20} className="text-fuchsia-300" />}
          <span className="text-sm font-semibold text-white">{name}</span>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-white/55">
          <Icon icon="lucide:ellipsis" size={14} />
          <Icon icon="lucide:chevron-down" size={14} className={cn("transition-transform", isExpanded && "rotate-180")} />
        </div>
      </button>
      {isExpanded && note && (
        <div className="px-3 pb-3">
          <p className="text-xs text-white/50 italic leading-relaxed">
            {note}
          </p>
        </div>
      )}
    </div>
  );
}

/** Subcategory section with header and effects */
function SubcategorySection({
  subcategory,
  subcategoryData,
  expandedEffect,
  onToggleEffect,
  onSelectEffect,
  isGeneral,
}: {
  subcategory: string;
  subcategoryData: { note: string; effects: EffectEntry[] };
  expandedEffect: string | null;
  onToggleEffect: (name: string) => void;
  onSelectEffect?: (name: string) => void;
  isGeneral: boolean;
}) {
  const hasSubcategoryNote = subcategoryData.note?.trim().length > 0;
  const subcategoryIcon = SUBCATEGORY_ICONS[subcategory];
  const hasIcon = !!subcategoryIcon;

  return (
    <div className={cn(!isGeneral && "rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/5")}>
      {!isGeneral && (
        <h4 className={cn(
          "mb-2 text-sm font-semibold text-white flex items-center gap-2",
          !hasIcon && "border-l-2 border-fuchsia-400/50 pl-3"
        )}>
          {hasIcon && <Icon icon={subcategoryIcon} size={20} className="text-fuchsia-300" />}
          {subcategory}
        </h4>
      )}
      {hasSubcategoryNote && (
        <p className={cn(
          "mb-3 text-xs text-white/50 italic leading-relaxed",
          !isGeneral && !hasIcon && "pl-3"
        )}>
          {subcategoryData.note}
        </p>
      )}
      <div className={!isGeneral && !hasIcon ? "pl-3" : ""}>
        <EffectsGroup
          effects={subcategoryData.effects}
          expandedEffect={expandedEffect}
          onToggleEffect={onToggleEffect}
          onSelectEffect={onSelectEffect}
        />
      </div>
    </div>
  );
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
  const canCollapseOverview = hasOverviewNote && overviewText.length > OVERVIEW_COLLAPSE_LENGTH;
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
        <p className="text-sm text-white/70 leading-relaxed">
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
          <div className="rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Icon icon="lucide:hand" size={16} className="text-fuchsia-200" />
              Physical
            </h3>
            {hasPhysicalNote && (
              <p className="mb-4 text-sm text-white/60 italic leading-relaxed">
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
          <div className="rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Icon icon="fluent:thinking-24-regular" size={20} className="text-fuchsia-200" />
              Cognitive
            </h3>
            {hasCognitiveNote && (
              <p className="mb-4 text-sm text-white/60 italic leading-relaxed">
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
          <div className="rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
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
            <div key={key} className="rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                {senseIcon && <Icon icon={senseIcon} size={20} className="text-fuchsia-200" />}
                {label}
              </h3>
              {hasSenseNote && (
                <p className="mb-4 text-sm text-white/60 italic leading-relaxed">
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
        <div className="mt-4 rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
            <Icon icon="lucide:git-compare-arrows" size={20} className="text-fuchsia-200" />
            Comparisons
          </h3>
          <ul className="space-y-2">
            {comparisons.map((item, idx) => (
              <li key={idx} className="text-sm">
                <span className="font-medium text-fuchsia-300">{item.drug}</span>
                <span className="text-white/50"> — </span>
                <span className="text-white/70">{item.comparison}</span>
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
