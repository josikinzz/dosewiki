import Link from "next/link";
import { ExpandButton, ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
import { cn } from "@/lib/utils";
import {
  SENSORY_CATEGORIES,
  isFlatSubcategoryKey,
  resolveSubcategory,
} from "@/data/subjectiveEffectSubcategories";
import { resolveEffectNameAlias, type EffectLocation } from "@/data/effectNameAliases";
import type {
  EffectCategory,
  EffectEntry,
  SenseCategory,
  SubjectiveEffects,
} from "@/schema";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";
import { slugify } from "@/utils/slug";

export { SENSORY_CATEGORIES, resolveSubcategory };

/**
 * At or below this many visible effects the section reads as a stub, no matter
 * how much supporting prose it carries.
 */
export const SUBJECTIVE_EFFECTS_STUB_MAX_EFFECTS = 3;

/**
 * Resolves an effect chip's destination, or null when the name has no page to
 * link to. Callers must render a null result as a plain chip: the alias table
 * exists because ~27% of chip names slugified to a route that 404s, and silently
 * emitting those links is what made the rot invisible.
 */
export function getEffectHref(name: string, location?: EffectLocation): string | null {
  const alias = resolveEffectNameAlias(slugify(name), location);

  return alias === undefined ? publicHref.effectFromName(name) : alias;
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

/**
 * Distinct effect chips one category renders. `CategoryEffects` de-dupes by
 * `effect.name` within the category it draws, so the same name repeated across
 * two subcategories is one chip to a reader — and one to this count.
 */
function countCategoryEffects(category: EffectCategory | undefined): number {
  const seen = new Set<string>();
  for (const subcategory of getSubcategories(category)) {
    for (const effect of getSubcategoryData(category, subcategory).effects) {
      const name = effect?.name?.trim();
      if (name) seen.add(name);
    }
  }
  return seen.size;
}

/**
 * Counts the leaf effect chips a reader actually sees in a subjective effects
 * section: the entries under `physical`, `cognitive`, and each sense's
 * `subcategories`, de-duped by name within each category the way the renderer
 * de-dupes them. `progressive_stages` and `comparisons` are deliberately
 * excluded — neither renders as an effect chip. Notes and the overview are not
 * counted either; prose does not make a section any less of a stub.
 */
export function countVisibleEffects(
  subjectiveEffects: SubjectiveEffects | undefined,
): number {
  if (!subjectiveEffects) return 0;

  const sensory = subjectiveEffects.sensory;
  const categories: (EffectCategory | undefined)[] = [
    subjectiveEffects.physical,
    subjectiveEffects.cognitive,
    ...SENSORY_CATEGORIES.map(
      ({ key }) => sensory?.[key as keyof typeof sensory]?.subcategories,
    ),
  ];

  return categories.reduce(
    (total, category) => total + countCategoryEffects(category),
    0,
  );
}

export function EffectBadge({
  effect,
  isExpanded,
  onToggle,
  onSelectEffect,
  location,
}: {
  effect: EffectEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectEffect?: (name: string) => void;
  location?: EffectLocation;
}) {
  const hasDescription = effect.description?.trim().length > 0;
  const href = getEffectHref(effect.name, location);
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
          {href === null ? (
            // No page to open: same typography, none of the link affordances.
            <span className="text-xs font-semibold text-dose-text-secondary">{effect.name}</span>
          ) : (
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
          )}
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
    // `PublicNameChip` renders a span by default; `as={Link}` is what opts it into
    // link mode, so an unresolved name simply omits it and keeps the same chip.
    if (href === null) {
      return <PublicNameChip>{effect.name}</PublicNameChip>;
    }

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
  location,
}: {
  effects: EffectEntry[];
  expandedEffect: string | null;
  onToggleEffect: (name: string) => void;
  onSelectEffect?: (name: string) => void;
  location?: EffectLocation;
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
          location={location}
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
  location,
}: {
  subcategory: string;
  subcategoryData: { note: string; effects: EffectEntry[] };
  expandedEffect: string | null;
  onToggleEffect: (name: string) => void;
  onSelectEffect?: (name: string) => void;
  isGeneral: boolean;
  location?: EffectLocation;
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
          location={location}
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
  location,
}: {
  category: EffectCategory | undefined;
  expandedEffect: string | null;
  onToggleEffect: (name: string) => void;
  onSelectEffect?: (name: string) => void;
  /**
   * Which part of the article this category renders. Threaded down because a few
   * names ("Euphoria", "Hallucinations") resolve to different effects depending
   * on position, so the chip cannot resolve its own href from the name alone.
   */
  location?: EffectLocation;
}) {
  const subcategories = getSubcategories(category);
  if (subcategories.length === 0) return null;

  const flatEffects: EffectEntry[] = [];
  const flatNotes: { subcategory: string; note: string }[] = [];
  const grouped: string[] = [];
  for (const subcategory of subcategories) {
    const data = getSubcategoryData(category, subcategory);
    const hasNote = data.note?.trim().length > 0;
    if (isFlatSubcategoryKey(subcategory) || (data.effects.length < 2 && !hasNote)) {
      flatEffects.push(...data.effects);
      if (hasNote) flatNotes.push({ subcategory, note: data.note });
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
      {flatNotes.map(({ subcategory, note }) => (
        <p key={subcategory} className="theme-text-muted mb-3 text-sm leading-relaxed">
          {note}
        </p>
      ))}
      {dedupedFlat.length > 0 && (
        <EffectsGroup
          effects={dedupedFlat}
          expandedEffect={expandedEffect}
          onToggleEffect={onToggleEffect}
          onSelectEffect={onSelectEffect}
          location={location}
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
          location={location}
        />
      ))}
    </div>
  );
}
