import Link from "next/link";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import type { EffectCategory, EffectEntry, SenseCategory } from "@/schema";
import { isPlainLeftClick } from "@/utils/navigation";
import { slugify } from "@/utils/slug";

export const SENSORY_CATEGORIES = [
  { key: "visual", label: "Visual", icon: "line-md:watch-loop" as IconName },
  { key: "auditory", label: "Auditory", icon: "lucide:ear" as IconName },
  { key: "tactile", label: "Tactile", icon: "lucide:hand" as IconName },
  { key: "olfactory", label: "Olfactory", icon: null },
  { key: "gustatory", label: "Gustatory", icon: null },
  { key: "multisensory", label: "Multisensory", icon: null },
] as const;

export const SUBCATEGORY_ICONS: Record<string, IconName> = {
  Enhancements: "lucide:arrow-up",
  Suppressions: "lucide:arrow-down",
  Distortions: "icon-park-outline:distortion",
  Geometry: "lucide:shapes",
  "Hallucinatory States": "custom:elf",
  "1. Taking Off": "lucide:trending-up",
  "2. The Waiting Room": "lucide:loader",
  "3. The Other Side": "lucide:house",
  "4. Coming Down": "lucide:trending-down",
};

const OVERVIEW_COLLAPSE_LENGTH = 280;

export function getEffectHref(name: string) {
  return `/effects/${slugify(name)}`;
}

export function truncateOverviewText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= OVERVIEW_COLLAPSE_LENGTH) return trimmed;

  const truncated = trimmed.slice(0, OVERVIEW_COLLAPSE_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return (
    lastSpace > OVERVIEW_COLLAPSE_LENGTH * 0.7 ? truncated.slice(0, lastSpace) : truncated
  ).trimEnd();
}

export function hasEffects(category: EffectCategory | undefined): boolean {
  if (!category || typeof category !== "object") return false;
  return Object.values(category).some(
    (subcategory) =>
      subcategory &&
      ((Array.isArray(subcategory.effects) && subcategory.effects.length > 0) ||
        subcategory.note?.trim().length > 0),
  );
}

export function hasSenseEffects(senseCategory: SenseCategory | undefined): boolean {
  if (!senseCategory) return false;
  return hasEffects(senseCategory.subcategories);
}

export function getSubcategories(category: EffectCategory | undefined): string[] {
  if (!category || typeof category !== "object") return [];
  return Object.keys(category).filter(
    (key) =>
      category[key] &&
      ((Array.isArray(category[key].effects) && category[key].effects.length > 0) ||
        category[key].note?.trim().length > 0),
  );
}

export function getSubcategoryData(
  category: EffectCategory | undefined,
  subcategory: string,
): { note: string; effects: EffectEntry[] } {
  if (!category || !category[subcategory]) return { note: "", effects: [] };
  return category[subcategory];
}

export function EffectBadge({
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

  if (isExpanded && hasDescription) {
    const parenMatch = effect.description.match(/^\(([^)]+)\)\s*[-–—]\s*/);
    const subtitleBadge = parenMatch ? parenMatch[1] : null;
    const descriptionText = parenMatch
      ? effect.description.slice(parenMatch[0].length)
      : effect.description;

    return (
      <div
        className={cn(
          "relative flex w-full flex-col items-start gap-3 rounded-lg px-4 py-4 text-left transition",
          "theme-inline-expanded-card my-2",
        )}
      >
        <ExpandButton
          isExpanded={true}
          onToggle={onToggle}
          variant="compact"
          className="absolute right-3 top-3 text-white/85"
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
            <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/50">
              {subtitleBadge}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-white/60">{descriptionText}</p>
      </div>
    );
  }

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
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400",
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

export function EffectsGroup({
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

export function CollapsibleStage({
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
    <div className="overflow-hidden rounded-lg bg-white/[0.04] ring-1 ring-white/[0.08]">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-400",
          "flex items-center justify-between gap-2",
          !isExpanded && "hover:bg-white/[0.03]",
        )}
      >
        <div className="flex items-center gap-2">
          {hasIcon && <Icon icon={stageIcon} size={20} className="text-fuchsia-300" />}
          <span className="text-sm font-semibold text-white">{name}</span>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-white/55">
          <Icon icon="lucide:ellipsis" size={14} />
          <Icon
            icon="lucide:chevron-down"
            size={14}
            className={cn("transition-transform", isExpanded && "rotate-180")}
          />
        </div>
      </button>
      {isExpanded && note && (
        <div className="px-3 pb-3">
          <p className="text-xs italic leading-relaxed text-white/50">{note}</p>
        </div>
      )}
    </div>
  );
}

export function SubcategorySection({
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
    <div className={cn(!isGeneral && "rounded-lg bg-white/[0.04] p-3 ring-1 ring-white/[0.08]")}>
      {!isGeneral && (
        <h4
          className={cn(
            "mb-2 flex items-center gap-2 text-sm font-semibold text-white",
            !hasIcon && "border-l-2 border-fuchsia-400/50 pl-3",
          )}
        >
          {hasIcon && <Icon icon={subcategoryIcon} size={20} className="text-fuchsia-300" />}
          {subcategory}
        </h4>
      )}
      {hasSubcategoryNote && (
        <p
          className={cn(
            "mb-3 text-xs italic leading-relaxed text-white/50",
            !isGeneral && !hasIcon && "pl-3",
          )}
        >
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
