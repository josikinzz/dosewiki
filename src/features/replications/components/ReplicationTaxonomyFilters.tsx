"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/common/Icon";
import { countActiveTaxonomyFilters } from "@/features/effects/gallery/galleryFilters";
import { UNDATED_YEAR_LABEL } from "@/features/effects/gallery/galleryModel";
import {
  UNDATED_YEAR_FILTER,
  type GalleryTaxonomyFilterState,
  type GalleryTypeFilter,
  type GalleryYearFilter,
} from "@/features/effects/gallery/galleryTypes";
import {
  MEDIA_LABEL,
  MEDIA_OPTIONS,
  TAXONOMY_FILTER_CHIP_LABELS as CHIP_LABELS,
  TAXONOMY_FILTER_LABELS as LABELS,
  TAXONOMY_FILTER_OPTIONS as OPTIONS,
  type TaxonomyFilterKey as FilterKey,
  type TaxonomyFilterOption as FilterOption,
} from "../replicationVocabulary";
import { useT, type Translate } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  CONTROL_TRIGGER_CHEVRON_CLASS,
  CONTROL_TRIGGER_CLASS,
  CONTROL_TRIGGER_LABEL_CLASS,
} from "@/components/ui/controlBarTrigger";

// Selects rendered as a flat list, then the "Named in the title" sub-group.
const GENERAL_KEYS = ["effect", "viewing", "family", "artistType"] as const;
const TITLE_KEYS = ["drug", "drugClass"] as const;

function mediaValueLabel(type: GalleryTypeFilter): string {
  return MEDIA_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

/**
 * A year filter's value is a year rail's own key, so its chip reads the same
 * as that rail's heading: a year, a span with an en dash, or "Undated".
 */
function yearValueLabel(year: GalleryYearFilter, translate: Translate): string {
  if (year === UNDATED_YEAR_FILTER) return translate(UNDATED_YEAR_LABEL);
  const [from, to] = year.split("-");
  return to === undefined ? from : `${from}\u2013${to}`;
}

export interface ReplicationTaxonomyFiltersProps {
  filters: GalleryTaxonomyFilterState;
  onChange: (filters: GalleryTaxonomyFilterState) => void;
  type: GalleryTypeFilter;
  onTypeChange: (type: GalleryTypeFilter) => void;
  /**
   * Set only by following a year rail, so this popover shows no control for
   * it — but its Clear takes it off, so its badge counts it. A reader looking
   * at one year with two filters on must not read "1 active".
   */
  year: GalleryYearFilter;
  onClear: () => void;
  drugOptions: ReadonlyArray<FilterOption>;
  effectOptions: ReadonlyArray<FilterOption>;
  className?: string;
}

export function ReplicationTaxonomyFilters({
  filters,
  onChange,
  type,
  onTypeChange,
  year,
  onClear,
  drugOptions,
  effectOptions,
  className,
}: ReplicationTaxonomyFiltersProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const activeCount =
    countActiveTaxonomyFilters(filters) +
    (type === "all" ? 0 : 1) +
    (year === "all" ? 0 : 1);

  const update = (key: FilterKey, value: string) => {
    onChange({ ...filters, [key]: value } as GalleryTaxonomyFilterState);
  };

  /**
   * One row per axis: name on the left, current value on the right. Stacked
   * label-above-control, the six axes stood 681px tall and the popover scrolled
   * on a 900px screen, so the reader had to scroll to discover controls nobody
   * had told them existed. Side by side they fit, and the column of values
   * reads as a list of what is set.
   */
  const renderSelect = (key: FilterKey) => (
    <label key={key} className="flex items-center justify-between gap-3">
      <span className="theme-text-secondary min-w-0 flex-1 text-xs font-medium">
        {t(LABELS[key])}
      </span>
      <Select value={filters[key]} onValueChange={(value) => update(key, value)}>
        <SelectTrigger
          selectSize="sm"
          aria-label={t(CHIP_LABELS[key])}
          className="w-40 shrink-0 [@media(pointer:coarse)]:min-h-11"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(key === "drug"
            ? [...OPTIONS.drug, ...drugOptions]
            : key === "effect"
            ? [...OPTIONS.effect, ...effectOptions]
            : OPTIONS[key]
          ).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t(option.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* The same object as its four neighbours in the control bar: glyph,
            label, chevron from `md` up, glyph alone below it. The count reads
            as part of the label where there is room for words, and rides the
            glyph's corner where there is not. */}
        <Button
          type="button"
          variant="pill"
          size="auto"
          className={cn("relative", CONTROL_TRIGGER_CLASS, className)}
          aria-label={
            activeCount > 0
              ? t("Filters, {{count}} active", { count: activeCount })
              : t("Filters")
          }
          title={
            activeCount > 0
              ? t("Filters, {{count}} active", { count: activeCount })
              : t("Filters")
          }
        >
          {/* Active filters tint the glyph. The `pill` variant declares its own
              border colour, so a `border-*` utility beside it is a coin toss
              the accent loses; colour on the icon has nothing to compete
              with. */}
          <Icon
            icon="lucide:sliders-horizontal"
            className={cn(
              "h-4 w-4 shrink-0",
              activeCount > 0 && "text-dose-accent-strong",
            )}
            aria-hidden
          />
          <span className={CONTROL_TRIGGER_LABEL_CLASS}>
            {activeCount > 0
              ? t("Filters · {{count}}", { count: activeCount })
              : t("Filters")}
          </span>
          <Icon
            icon="lucide:chevron-down"
            className={CONTROL_TRIGGER_CHEVRON_CLASS}
            aria-hidden
          />
          {activeCount > 0 ? (
            // Accent on the bar's own material rather than `theme-badge-surface`,
            // whose appearance-matrix rule repaints it in body text colour: a
            // white numeral was the weakest possible mark for the only state
            // this control keeps while closed.
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-dose-surface-muted px-1 text-[0.625rem] font-semibold leading-4 text-dose-accent-strong md:hidden"
            >
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={8}
        className="max-h-[min(var(--radix-popover-content-available-height),38rem)] w-[calc(100vw-1rem)] space-y-2.5 overflow-y-auto sm:w-80"
      >
        {/* The popover holds seven axes, so it says what it is at the top:
            without a heading the reader who pressed an unnamed glyph met
            unexplained dropdowns and a scrollbar. */}
        <p className="theme-text-primary text-sm font-semibold">{t("Filter works")}</p>

        {/* Media leads: it is the axis readers reach for most, and the one
            that used to have the bar slot this popover absorbed. */}
        <label className="flex items-center justify-between gap-3">
          <span className="theme-text-secondary min-w-0 flex-1 text-xs font-medium">
            {t(MEDIA_LABEL)}
          </span>
          <Select
            value={type}
            onValueChange={(value) => onTypeChange(value as GalleryTypeFilter)}
          >
            <SelectTrigger
              selectSize="sm"
              aria-label={t(MEDIA_LABEL)}
              className="w-40 shrink-0 [@media(pointer:coarse)]:min-h-11"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEDIA_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {GENERAL_KEYS.map(renderSelect)}

        <fieldset className="space-y-2.5 rounded-xl border border-dose-divider p-3">
          <legend className="theme-text-faint px-1 text-xs font-semibold uppercase tracking-[0.14em]">
            {t("Named in the title")}
          </legend>
          {TITLE_KEYS.map(renderSelect)}
        </fieldset>

        {/* Sticky so Clear/Done stay reachable while the list scrolls; the
            negative margins let the row own the popover's bottom padding, and
            theme-overlay-surface repaints the popover's own opaque material
            (all four appearance matrix points restyle that class together). */}
        <div className="theme-overlay-surface sticky bottom-0 z-10 -mx-4 -mb-4 space-y-2 border-t px-4 py-2.5">
          {/* Full width: sharing a row with the buttons wrapped it to three
              lines and squeezed both exits into the corner. */}
          <p className="theme-text-faint text-xs">
            {t("Filtering by a tag hides works nobody has tagged yet.")}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="[@media(pointer:coarse)]:min-h-11"
              disabled={activeCount === 0}
              onClick={onClear}
            >
              {t("Clear")}
            </Button>
            <Button
              type="button"
              variant="accent"
              size="sm"
              className="[@media(pointer:coarse)]:min-h-11"
              onClick={() => setOpen(false)}
            >
              {t("Done")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface ReplicationActiveFilterChipsProps {
  filters: GalleryTaxonomyFilterState;
  onChange: (filters: GalleryTaxonomyFilterState) => void;
  type: GalleryTypeFilter;
  onTypeChange: (type: GalleryTypeFilter) => void;
  year: GalleryYearFilter;
  onYearChange: (year: GalleryYearFilter) => void;
  drugOptions: ReadonlyArray<FilterOption>;
  effectOptions: ReadonlyArray<FilterOption>;
  className?: string;
}

/**
 * Slim row of removable chips, one per active filter — the visible
 * counterpart of the popover's count badge. Shares the popover's option
 * labels and the same whole-state `onChange`, so removing a chip is exactly
 * a select flipping back to "all" (URL params and corpus update together).
 * Renders nothing while every filter is at its default.
 *
 * Media leads the row for the same reason it leads the popover, and it is the
 * one filter that used to be readable from the bar itself: once it moved into
 * the popover, a chip is the only thing that still says "you are looking at
 * videos only" without opening anything.
 */
export function ReplicationActiveFilterChips({
  filters,
  onChange,
  type,
  onTypeChange,
  year,
  onYearChange,
  drugOptions,
  effectOptions,
  className,
}: ReplicationActiveFilterChipsProps) {
  const t = useT();
  const active = (Object.keys(OPTIONS) as FilterKey[]).filter(
    (key) => filters[key] !== "all",
  );
  if (active.length === 0 && type === "all" && year === "all") return null;

  // Corpus-derived facets (drug, effect) label from their live option lists;
  // a URL-typed value missing from the corpus falls back to its raw slug.
  const valueLabel = (key: FilterKey): string => {
    const value = filters[key];
    const pool =
      key === "drug"
        ? drugOptions
        : key === "effect"
        ? effectOptions
        : OPTIONS[key];
    return t(pool.find((option) => option.value === value)?.label ?? value);
  };

  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {type === "all" ? null : (
        <li className="theme-feedback-enter">
          <Button
            type="button"
            variant="pill"
            size="pill"
            aria-label={t("Remove {{filter}} filter: {{value}}", {
              filter: t(MEDIA_LABEL),
              value: t(mediaValueLabel(type)),
            })}
            onClick={() => onTypeChange("all")}
            className="gap-1.5 px-3 py-1 text-xs [@media(pointer:coarse)]:min-h-11"
          >
            <span className="theme-text-faint" aria-hidden>
              {t("{{label}}:", { label: t(MEDIA_LABEL) })}
            </span>
            <span className="font-medium" aria-hidden>
              {t(mediaValueLabel(type))}
            </span>
            <Icon icon="lucide:x" className="h-3 w-3" aria-hidden />
          </Button>
        </li>
      )}
      {year === "all" ? null : (
        <li className="theme-feedback-enter">
          <Button
            type="button"
            variant="pill"
            size="pill"
            aria-label={t("Remove year filter: {{value}}", {
              value: yearValueLabel(year, t),
            })}
            onClick={() => onYearChange("all")}
            className="gap-1.5 px-3 py-1 text-xs [@media(pointer:coarse)]:min-h-11"
          >
            <span className="theme-text-faint" aria-hidden>
              {t("Year:")}
            </span>
            <span className="font-medium" aria-hidden>
              {yearValueLabel(year, t)}
            </span>
            <Icon icon="lucide:x" className="h-3 w-3" aria-hidden />
          </Button>
        </li>
      )}
      {active.map((key) => (
        <li key={key} className="theme-feedback-enter">
          <Button
            type="button"
            variant="pill"
            size="pill"
            aria-label={t("Remove {{filter}} filter: {{value}}", {
              filter: t(CHIP_LABELS[key]),
              value: valueLabel(key),
            })}
            onClick={() =>
              onChange({ ...filters, [key]: "all" } as GalleryTaxonomyFilterState)
            }
            className="gap-1.5 px-3 py-1 text-xs [@media(pointer:coarse)]:min-h-11"
          >
            <span className="theme-text-faint" aria-hidden>
              {t("{{label}}:", { label: t(CHIP_LABELS[key]) })}
            </span>
            <span className="font-medium" aria-hidden>
              {valueLabel(key)}
            </span>
            <Icon icon="lucide:x" className="h-3 w-3" aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}
