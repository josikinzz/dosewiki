import { SmartLink } from "@/components/common/SmartLink";
import type { ReactNode } from "react";
import {
  ExpandButton,
  ExpandIndicator,
} from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
import { cn } from "@/lib/utils";
import {
  SENSORY_CATEGORIES,
  isFlatSubcategoryKey,
  resolveSubcategory,
} from "@/data/subjectiveEffectSubcategories";
import {
  resolveEffectNameAlias,
  type EffectLocation,
} from "@/data/effectNameAliases";
import type { EffectCategory, EffectEntry } from "@/schema";
import { getSubcategories, getSubcategoryData } from "./subjectiveEffectsModel";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";
import { slugify } from "@/utils/slug";
import { EditableSlot, EditableValue, buildFieldPath } from "../../editing";
import { useT, type MessageValues } from "@/i18n/client";

export { SENSORY_CATEGORIES };

export type EffectNotePathBase = readonly string[];

function getEffectHref(name: string, location?: EffectLocation): string | null {
  const alias = resolveEffectNameAlias(slugify(name), location);

  return alias === undefined ? publicHref.effectFromName(name) : alias;
}

function EffectBadge({
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
  const t = useT();
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
    const parenMatch = effect.description.match(/^\(([^)]+)\)\s*[-–\u2014]\s*/);
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
          ariaLabel={t("Collapse {{effect}} effect description", {
            effect: effect.name,
          })}
          ariaControls={panelId}
        />
        <div className="flex flex-wrap items-center gap-2 pr-8">
          {href === null ? (
            <span className="text-xs font-semibold text-dose-text-secondary">
              {t(effect.name)}
            </span>
          ) : (
            <SmartLink
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
              className="text-xs font-semibold text-dose-text-secondary transition-colors hover:text-dose-accent-soft theme-focus-ring"
            >
              {t(effect.name)}
            </SmartLink>
          )}
          {subtitleBadge && (
            <span className="rounded bg-dose-surface-strong px-2 py-0.5 text-xs text-dose-text-faint">
              {subtitleBadge}
            </span>
          )}
        </div>
        <p className="theme-reveal-enter text-sm leading-relaxed text-dose-text-muted">
          {descriptionText}
        </p>
      </div>
    );
  }

  if (!hasDescription) {
    if (href === null) {
      return <PublicNameChip>{t(effect.name)}</PublicNameChip>;
    }

    return (
      <PublicNameChip
        as={SmartLink}
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
        {t(effect.name)}
      </PublicNameChip>
    );
  }

  return (
    <PublicNameChip
      as="button"
      type="button"
      onClick={handleClick}
      aria-expanded={false}
      aria-label={t("Expand {{effect}} effect description", {
        effect: effect.name,
      })}
      aria-controls={panelId}
      interactive
    >
      {t(effect.name)}
      <ExpandIndicator isExpanded={false} />
    </PublicNameChip>
  );
}

function EffectsGroup({
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

function MaybeEditable({
  children,
  label,
  labelValues,
  path,
  value,
}: {
  children: ReactNode;
  label: string;
  labelValues?: MessageValues;
  path?: string;
  value: string;
}) {
  if (!path) return <>{children}</>;

  return (
    <EditableValue
      as="div"
      label={label}
      labelValues={labelValues}
      path={path}
      value={value ?? ""}
    >
      {children}
    </EditableValue>
  );
}

export function CollapsibleStage({
  name,
  note,
  isExpanded,
  onToggle,
  notePath,
}: {
  name: string;
  note: string;
  isExpanded: boolean;
  onToggle: () => void;
  notePath?: string;
}) {
  const t = useT();
  const { label: rawStageLabel, icon: stageIcon } = resolveSubcategory(name);
  const stageLabel = t(rawStageLabel);
  const hasNote = note?.trim().length > 0;
  const panelId = `subjective-stage-${slugify(name)}-note`;

  const rowContent = (
    <>
      {stageIcon && (
        <Icon
          icon={stageIcon}
          size={18}
          className="theme-icon-accent shrink-0"
        />
      )}
      <span className="theme-text-primary min-w-0 flex-1 text-sm font-semibold">
        {stageLabel}
      </span>
    </>
  );

  return (
    <div
      className="theme-progressive-stage rounded-xl"
      data-expanded={isExpanded || undefined}
    >
      {hasNote ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className={cn(
            "theme-progressive-stage-trigger flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left",
            "theme-focus-ring",
          )}
        >
          {rowContent}
          <ExpandIndicator
            isExpanded={isExpanded}
            className="theme-text-muted shrink-0"
          />
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-3 py-3">
          {rowContent}
        </div>
      )}
      {hasNote && (
        <div
          className={cn(
            "grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 motion-safe:ease-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <MaybeEditable
              label="{{label}} note"
              labelValues={{ label: stageLabel }}
              path={notePath}
              value={note}
            >
              <p
                id={panelId}
                className="theme-text-secondary pb-3 pl-[2.625rem] pr-3 text-sm leading-relaxed"
              >
                {note}
              </p>
            </MaybeEditable>
          </div>
        </div>
      )}
      {!hasNote && notePath ? (
        <EditableSlot
          className="pb-3 pl-[2.625rem] pr-3"
          emptyLabel="Add a {{label}} note"
          label="{{label}} note"
          labelValues={{ label: stageLabel }}
          path={notePath}
          value={note ?? ""}
        />
      ) : null}
    </div>
  );
}

function SubcategorySection({
  subcategory,
  subcategoryData,
  expandedEffect,
  onToggleEffect,
  onSelectEffect,
  isGeneral,
  location,
  notePathBase,
}: {
  subcategory: string;
  subcategoryData: { note: string; effects: EffectEntry[] };
  expandedEffect: string | null;
  onToggleEffect: (name: string) => void;
  onSelectEffect?: (name: string) => void;
  isGeneral: boolean;
  location?: EffectLocation;
  notePathBase?: EffectNotePathBase;
}) {
  const t = useT();
  const hasSubcategoryNote = subcategoryData.note?.trim().length > 0;
  const { label: rawSubcategoryLabel, icon: subcategoryIcon } =
    resolveSubcategory(subcategory);
  const subcategoryLabel = t(rawSubcategoryLabel);
  const notePath = notePathBase
    ? buildFieldPath(...notePathBase, subcategory, "note")
    : undefined;

  return (
    <div className={cn(!isGeneral && "pl-5 pt-5 first:pt-0 sm:pl-6")}>
      {!isGeneral && (
        <h4 className="theme-text-secondary mb-2.5 flex items-center gap-1.5 text-[0.8125rem] font-semibold leading-5">
          {subcategoryIcon ? (
            <Icon
              icon={subcategoryIcon}
              size={16}
              className="theme-icon-accent"
            />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-dose-accent-muted" />
          )}
          {subcategoryLabel}
        </h4>
      )}
      {hasSubcategoryNote && (
        <MaybeEditable
          label="{{label}} note"
          labelValues={{ label: subcategoryLabel }}
          path={notePath}
          value={subcategoryData.note}
        >
          <p className="theme-text-muted mb-3 text-sm leading-relaxed">
            {subcategoryData.note}
          </p>
        </MaybeEditable>
      )}
      {!hasSubcategoryNote && notePath ? (
        <EditableSlot
          className="mb-3"
          emptyLabel="Add a {{label}} note"
          label="{{label}} note"
          labelValues={{ label: subcategoryLabel }}
          path={notePath}
          value={subcategoryData.note ?? ""}
        />
      ) : null}
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

export function CategoryEffects({
  category,
  expandedEffect,
  onToggleEffect,
  onSelectEffect,
  location,
  notePathBase,
}: {
  category: EffectCategory | undefined;
  expandedEffect: string | null;
  onToggleEffect: (name: string) => void;
  onSelectEffect?: (name: string) => void;
  location?: EffectLocation;
  notePathBase?: EffectNotePathBase;
}) {
  const t = useT();
  const subcategories = getSubcategories(category);
  if (subcategories.length === 0) return null;

  const flatEffects: EffectEntry[] = [];
  const flatNotes: { subcategory: string; note: string }[] = [];
  const grouped: string[] = [];
  for (const subcategory of subcategories) {
    const data = getSubcategoryData(category, subcategory);
    const hasNote = data.note?.trim().length > 0;
    if (
      isFlatSubcategoryKey(subcategory) ||
      (data.effects.length < 2 && !hasNote)
    ) {
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
        <MaybeEditable
          key={subcategory}
          label="{{label}} note"
          labelValues={{ label: t(resolveSubcategory(subcategory).label) }}
          path={
            notePathBase
              ? buildFieldPath(...notePathBase, subcategory, "note")
              : undefined
          }
          value={note}
        >
          <p className="theme-text-muted mb-3 text-sm leading-relaxed">
            {note}
          </p>
        </MaybeEditable>
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
          notePathBase={notePathBase}
        />
      ))}
    </div>
  );
}
