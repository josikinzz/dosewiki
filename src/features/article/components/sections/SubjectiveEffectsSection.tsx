import { memo, useState } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import { cn } from "@/lib/utils";
import type { SubstanceArticle, EffectCategory, EffectEntry, SenseCategory } from "@/schema";

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

  const handleClick = () => {
    if (hasDescription) {
      onToggle();
    } else if (onSelectEffect) {
      onSelectEffect(effect.name);
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
        <button
          type="button"
          onClick={onToggle}
          className="absolute top-3 right-3 p-1 rounded hover:bg-white/10 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400 flex items-center gap-0.5"
          aria-label="Collapse"
        >
          <Icon icon="lucide:ellipsis" size={12} className="text-white/85" />
          <Icon icon="lucide:chevron-down" size={12} className="text-white/85 rotate-180 transition-transform" />
        </button>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <span className="text-xs font-semibold text-white/85">
            {effect.name}
          </span>
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
  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition",
        "bg-white/[0.03] text-white/85 ring-1 ring-white/10",
        "hover:bg-white/10 hover:text-fuchsia-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
      )}
    >
      {effect.name}
      {hasDescription && (
        <>
          <Icon icon="lucide:ellipsis" size={12} />
          <Icon icon="lucide:chevron-down" size={12} className="transition-transform" />
        </>
      )}
    </button>
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
        <div className={cn(
          "flex items-center gap-1 text-white/50",
          isExpanded && "rounded p-1 -m-1 hover:bg-white/10 transition"
        )}>
          <Icon icon="lucide:ellipsis" size={16} />
          <Icon icon="lucide:chevron-down" size={16} className={cn("transition-transform", isExpanded && "rotate-180")} />
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

  if (!hasAnySensory && !hasCognitive && !hasPhysical && !hasProgressiveStages && !hasComparisons && !hasOverviewNote) {
    return null;
  }

  return (
    <div id="subjective-effects" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="lucide:sparkles" title="Subjective Effects" />

      {/* Overview note as intro paragraph, or fallback to generic text */}
      <p className="text-sm text-white/70 leading-relaxed">
        {hasOverviewNote
          ? subjective_effects.notes.overview
          : "Effects vary widely by individual, dose, and context."}
      </p>

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
        // Split text around author name to render author as bold link
        const authorIndex = text.indexOf(author);
        const beforeAuthor = authorIndex > 0 ? text.slice(0, authorIndex) : "";
        const afterAuthor = authorIndex >= 0 ? text.slice(authorIndex + author.length) : text;
        const profileKey = author === "Josie Kins" ? "JOSIE" : author.toUpperCase().replace(/\s+/g, "_");

        return (
          <div className="mt-4 flex justify-end">
            <div className="group relative flex items-center gap-2.5 rounded-full bg-white/[0.04] pl-3 pr-4 py-1.5 ring-1 ring-white/10 hover:ring-fuchsia-400/30 hover:bg-white/[0.06] transition">
              {/* Stretched link covering the whole banner */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 z-0"
                aria-label="View original article"
              />
              {author === "Josie Kins" && (
                <a
                  href={`#/contributors/${profileKey}`}
                  className="relative z-10 pointer-events-auto"
                >
                  <img
                    src="/profile-avatars/josie/avatar.webp"
                    alt="Josie Kins"
                    className="h-6 w-6 rounded-full object-cover ring-1 ring-white/20 hover:ring-fuchsia-400/50 transition"
                  />
                </a>
              )}
              <span className="relative z-10 text-xs text-white/50 group-hover:text-white/60 transition pointer-events-none">
                {beforeAuthor}
                <a
                  href={`#/contributors/${profileKey}`}
                  className="font-semibold text-white/70 hover:text-fuchsia-300 transition pointer-events-auto"
                >
                  {author}
                </a>
                {afterAuthor}
              </span>
              <Icon icon="lucide:external-link" size={14} className="relative z-10 -ml-1 text-white/30 group-hover:text-white/50 transition pointer-events-none" />
            </div>
          </div>
        );
      })()}
    </div>
  );
});
