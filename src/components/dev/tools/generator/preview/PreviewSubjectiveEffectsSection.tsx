import { memo, useState } from "react";
import { Brain, Eye, Ear, Hand, Sparkles, GitCompareArrows, Maximize2, Minimize2, ArrowUp, Waves, Shapes, ScanEye, type LucideIcon } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import { cn } from "@/lib/utils";
import type { SubstanceArticle, EffectCategory, EffectEntry, SenseCategory } from "../../../../../schema";

interface PreviewSubjectiveEffectsSectionProps {
  article: SubstanceArticle;
  /** Called when an effect badge is clicked */
  onSelectEffect?: (effect: string) => void;
}

const SENSORY_CATEGORIES = [
  { key: "visual", label: "Visual", icon: Eye },
  { key: "auditory", label: "Auditory", icon: Ear },
  { key: "tactile", label: "Tactile", icon: Hand },
  { key: "olfactory", label: "Olfactory", icon: null },
  { key: "gustatory", label: "Gustatory", icon: null },
  { key: "multisensory", label: "Multisensory", icon: null },
] as const;

/** Icons for specific subcategory names */
const SUBCATEGORY_ICONS: Record<string, LucideIcon> = {
  "Enhancements": ArrowUp,
  "Distortions": Waves,
  "Geometry": Shapes,
  "Hallucinatory States": ScanEye,
};

/** Check if an effect category has any effects */
function hasEffects(category: EffectCategory | undefined): boolean {
  if (!category || typeof category !== "object") return false;
  return Object.values(category).some(
    (sub) => sub && Array.isArray(sub.effects) && sub.effects.length > 0
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
          "bg-white/[0.08] backdrop-blur-sm ring-1 ring-white/15 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]",
          "w-full my-2"
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          className="absolute top-3 right-3 p-1 rounded hover:bg-white/10 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400"
          aria-label="Collapse"
        >
          <Minimize2 className="h-4 w-4 text-white/85" />
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
        "bg-white/10 text-white/85 ring-1 ring-white/10",
        "hover:bg-white/12 hover:text-fuchsia-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
      )}
    >
      {effect.name}
      {hasDescription && (
        <Maximize2 className="h-4 w-4" />
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
  const SubcategoryIcon = SUBCATEGORY_ICONS[subcategory];
  const hasIcon = !!SubcategoryIcon;

  return (
    <div className={cn(!isGeneral && "rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/5")}>
      {!isGeneral && (
        <h4 className={cn(
          "mb-2 text-sm font-semibold text-white/70 flex items-center gap-2",
          !hasIcon && "border-l-2 border-fuchsia-400/50 pl-3"
        )}>
          {hasIcon && <SubcategoryIcon className="h-4 w-4 text-fuchsia-300/70" />}
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

export const PreviewSubjectiveEffectsSection = memo(function PreviewSubjectiveEffectsSection({
  article,
  onSelectEffect,
}: PreviewSubjectiveEffectsSectionProps) {
  const { subjective_effects, comparisons } = article;

  // Track which effect is currently expanded (only one at a time across all categories)
  const [expandedEffect, setExpandedEffect] = useState<string | null>(null);

  const toggleEffect = (effectName: string) => {
    setExpandedEffect((prev) => (prev === effectName ? null : effectName));
  };

  const hasCognitive = hasEffects(subjective_effects.cognitive);
  const hasPhysical = hasEffects(subjective_effects.physical);
  const hasComparisons = comparisons && comparisons.length > 0;
  const hasOverviewNote = subjective_effects.notes?.overview?.trim().length > 0;
  const hasCognitiveNote = subjective_effects.notes?.cognitive?.trim().length > 0;
  const hasPhysicalNote = subjective_effects.notes?.physical?.trim().length > 0;

  // Check if any sensory category has effects
  const hasAnySensory = SENSORY_CATEGORIES.some(
    ({ key }) => hasSenseEffects(subjective_effects.sensory[key as keyof typeof subjective_effects.sensory])
  );

  if (!hasAnySensory && !hasCognitive && !hasPhysical && !hasComparisons && !hasOverviewNote) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon={Sparkles} label="Subjective Effects" />
        Subjective Effects
      </h2>
      {/* Overview note as intro paragraph, or fallback to generic text */}
      <p className="mb-4 text-sm text-white/70 leading-relaxed">
        {hasOverviewNote
          ? subjective_effects.notes.overview
          : "Effects vary widely by individual, dose, and context."}
      </p>

      {/* Full-width stacked layout: Physical, Cognitive, Visual, Auditory, other senses */}
      <div className="space-y-4">
        {/* Physical Effects Card */}
        {hasPhysical && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Hand className="h-4 w-4 text-fuchsia-200" />
              Physical
            </h3>
            {hasPhysicalNote && (
              <>
                <p className="mb-3 text-sm text-white/60 italic leading-relaxed">
                  {subjective_effects.notes.physical}
                </p>
                <div className="mb-3 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              </>
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
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Brain className="h-4 w-4 text-fuchsia-200" />
              Cognitive
            </h3>
            {hasCognitiveNote && (
              <>
                <p className="mb-3 text-sm text-white/60 italic leading-relaxed">
                  {subjective_effects.notes.cognitive}
                </p>
                <div className="mb-3 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              </>
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

        {/* Sensory Cards - Visual, Auditory, then others */}
        {SENSORY_CATEGORIES.map(({ key, label, icon: Icon }) => {
          const senseCategory = subjective_effects.sensory[key as keyof typeof subjective_effects.sensory];
          if (!hasSenseEffects(senseCategory)) return null;

          const subcategories = getSubcategories(senseCategory.subcategories);
          const hasSenseNote = senseCategory.note?.trim().length > 0;

          return (
            <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                {Icon && <Icon className="h-4 w-4 text-fuchsia-200" />}
                {label}
              </h3>
              {hasSenseNote && (
                <>
                  <p className="mb-3 text-sm text-white/60 italic leading-relaxed">
                    {senseCategory.note}
                  </p>
                  <div className="mb-3 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                </>
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
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <GitCompareArrows className="h-4 w-4 text-fuchsia-200" />
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
    </SectionCard>
  );
});
