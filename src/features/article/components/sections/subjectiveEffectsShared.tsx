import Link from "next/link";
import { ExpandButton, ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon, type IconName } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
import { cn } from "@/lib/utils";
import type { EffectCategory, EffectEntry, SenseCategory } from "@/schema";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";
import { slugify } from "@/utils/slug";

export const SENSORY_CATEGORIES = [
  { key: "visual", label: "Visual", icon: "line-md:watch-loop" as IconName },
  { key: "auditory", label: "Auditory", icon: "lucide:ear" as IconName },
  { key: "tactile", label: "Tactile", icon: "lucide:hand" as IconName },
  { key: "olfactory", label: "Olfactory", icon: null },
  { key: "gustatory", label: "Gustatory", icon: null },
  { key: "multisensory", label: "Multisensory", icon: null },
] as const;

type SubcategoryMeta = { label: string; icon?: IconName };

/**
 * Canonical subcategory presentation, keyed by a NORMALIZED form of the key
 * (lowercased, non-alphanumerics stripped) so the same entry matches whatever
 * casing/spacing the data or a generation prompt happens to emit
 * ("Distortions", "distortions", "hallucinatory_states" all resolve here).
 * `label` is the human header; `icon` is optional.
 */
const SUBCATEGORY_REGISTRY: Record<string, SubcategoryMeta> = {
  // Sensory
  enhancements: { label: "Enhancements", icon: "lucide:arrow-up" },
  suppressions: { label: "Suppressions", icon: "lucide:arrow-down" },
  suppression: { label: "Suppressions", icon: "lucide:arrow-down" },
  distortions: { label: "Distortions", icon: "icon-park-outline:distortion" },
  distortion: { label: "Distortions", icon: "icon-park-outline:distortion" },
  geometry: { label: "Geometry", icon: "lucide:shapes" },
  hallucinatory: { label: "Hallucinatory States", icon: "custom:elf" },
  hallucinatorystates: { label: "Hallucinatory States", icon: "custom:elf" },
  hallucinations: { label: "Hallucinatory States", icon: "custom:elf" },
  // Cognitive
  emotional: { label: "Emotional", icon: "lucide:heart" },
  social: { label: "Social", icon: "lucide:users" },
  transpersonal: { label: "Transpersonal", icon: "lucide:sparkles" },
  perception: { label: "Perception", icon: "lucide:scan-eye" },
  // Physical
  stimulation: { label: "Stimulation", icon: "lucide:zap" },
  sedation: { label: "Sedation", icon: "lucide:moon" },
  cardiovascular: { label: "Cardiovascular", icon: "lucide:heart-pulse" },
  autonomic: { label: "Autonomic", icon: "lucide:thermometer" },
  uncomfortable: { label: "Uncomfortable", icon: "lucide:frown" },
  // Progressive stages (legacy numeric-prefixed keys)
  "1takingoff": { label: "1. Taking Off", icon: "lucide:trending-up" },
  "2thewaitingroom": { label: "2. The Waiting Room", icon: "lucide:hourglass" },
  "3theotherside": { label: "3. The Other Side", icon: "lucide:house" },
  "4comingdown": { label: "4. Coming Down", icon: "lucide:trending-down" },
};

export function normalizeSubcategoryKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function titleCaseSubcategoryKey(key: string): string {
  const cleaned = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return key;
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Resolve a raw subcategory key to its display label and (optional) icon.
 * Unknown keys still get a presentable Title Case label instead of a raw
 * lowercase token, so nothing renders as a bare janky bullet + slug.
 */
export function resolveSubcategory(key: string): SubcategoryMeta {
  return (
    SUBCATEGORY_REGISTRY[normalizeSubcategoryKey(key)] ?? {
      label: titleCaseSubcategoryKey(key),
    }
  );
}

const OVERVIEW_COLLAPSE_LENGTH = 280;

export function getEffectHref(name: string) {
  return publicHref.effectFromName(name);
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
  const panelId = `effect-${slugify(effect.name)}-description`;

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
        id={panelId}
        className={cn(
          "relative flex w-full flex-col items-start gap-3 rounded-lg px-4 py-4 text-left transition",
          "theme-inline-expanded-card my-2",
        )}
      >
        <ExpandButton
          isExpanded={true}
          onToggle={onToggle}
          variant="card"
          className="absolute right-3 top-3 text-dose-text-secondary"
          ariaLabel={`Collapse ${effect.name} effect description`}
          ariaControls={panelId}
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
            className="text-xs font-semibold text-dose-text-secondary transition-colors hover:text-dose-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent"
          >
            {effect.name}
          </Link>
          {subtitleBadge && (
            <span className="rounded bg-dose-surface-strong px-2 py-0.5 text-xs text-dose-text-faint">
              {subtitleBadge}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-dose-text-muted">{descriptionText}</p>
      </div>
    );
  }

  if (!hasDescription) {
    return (
      <PublicNameChip
        as={Link}
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
        interactive
      >
        {effect.name}
      </PublicNameChip>
    );
  }

  return (
    <PublicNameChip
      as="button"
      type="button"
      onClick={handleClick}
      aria-expanded={false}
      aria-label={`Expand ${effect.name} effect description`}
      aria-controls={panelId}
      interactive
    >
      {effect.name}
      <ExpandIndicator isExpanded={false} />
    </PublicNameChip>
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
  const { label: stageLabel, icon: stageIcon } = resolveSubcategory(name);
  const hasNote = note?.trim().length > 0;
  const panelId = `subjective-stage-${slugify(name)}-note`;

  const rowContent = (
    <>
      {stageIcon && (
        <Icon icon={stageIcon} size={18} className="shrink-0 text-dose-accent-strong" />
      )}
      <span className="theme-text-primary min-w-0 flex-1 text-sm font-semibold">{stageLabel}</span>
    </>
  );

  return (
    <div className="theme-progressive-stage rounded-xl" data-expanded={isExpanded || undefined}>
      {hasNote ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className={cn(
            "theme-progressive-stage-trigger flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent",
          )}
        >
          {rowContent}
          <ExpandIndicator isExpanded={isExpanded} className="theme-text-muted shrink-0" />
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-3 py-3">{rowContent}</div>
      )}
      {hasNote && (
        <div
          className={cn(
            "grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 motion-safe:ease-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <p
              id={panelId}
              className="theme-text-secondary pb-3 pl-[2.625rem] pr-3 text-sm leading-relaxed"
            >
              {note}
            </p>
          </div>
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
  const { label: subcategoryLabel, icon: subcategoryIcon } = resolveSubcategory(subcategory);

  return (
    <div className={cn(!isGeneral && "pl-5 pt-5 first:pt-0 sm:pl-6")}>
      {!isGeneral && (
        <h4
          className="theme-text-secondary mb-2.5 flex items-center gap-1.5 text-[0.8125rem] font-semibold leading-5"
        >
          {subcategoryIcon ? (
            <Icon icon={subcategoryIcon} size={16} className="text-dose-accent-soft" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-dose-accent-muted" />
          )}
          {subcategoryLabel}
        </h4>
      )}
      {hasSubcategoryNote && (
        <p className="theme-text-muted mb-3 text-sm leading-relaxed">
          {subcategoryData.note}
        </p>
      )}
      <div>
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

/**
 * Renders a whole effect category (physical, cognitive, or a sense's
 * subcategories). A subcategory earns its header only when it groups two or
 * more effects, or carries a note that needs an anchor; `General` and lone
 * single-effect subcategories merge into one flat leading chip row, so a
 * header never restates the single chip beneath it.
 */
export function CategoryEffects({
  category,
  expandedEffect,
  onToggleEffect,
  onSelectEffect,
}: {
  category: EffectCategory | undefined;
  expandedEffect: string | null;
  onToggleEffect: (name: string) => void;
  onSelectEffect?: (name: string) => void;
}) {
  const subcategories = getSubcategories(category);
  if (subcategories.length === 0) return null;

  const flatEffects: EffectEntry[] = [];
  const grouped: string[] = [];
  for (const subcategory of subcategories) {
    const data = getSubcategoryData(category, subcategory);
    const hasNote = data.note?.trim().length > 0;
    if (subcategory === "General" || (data.effects.length < 2 && !hasNote)) {
      flatEffects.push(...data.effects);
    } else {
      grouped.push(subcategory);
    }
  }

  const seen = new Set<string>();
  const dedupedFlat = flatEffects.filter((effect) => {
    if (seen.has(effect.name)) return false;
    seen.add(effect.name);
    return true;
  });

  return (
    <div className="space-y-4">
      {dedupedFlat.length > 0 && (
        <EffectsGroup
          effects={dedupedFlat}
          expandedEffect={expandedEffect}
          onToggleEffect={onToggleEffect}
          onSelectEffect={onSelectEffect}
        />
      )}
      {grouped.map((subcategory) => (
        <SubcategorySection
          key={subcategory}
          subcategory={subcategory}
          subcategoryData={getSubcategoryData(category, subcategory)}
          expandedEffect={expandedEffect}
          onToggleEffect={onToggleEffect}
          onSelectEffect={onSelectEffect}
          isGeneral={false}
        />
      ))}
    </div>
  );
}
