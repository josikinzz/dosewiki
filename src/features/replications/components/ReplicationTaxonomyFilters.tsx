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
import {
  countActiveTaxonomyFilters,
  type GalleryTaxonomyFilterState,
} from "@/features/effects/gallery/galleryModel";
import { cn } from "@/lib/utils";

type FilterKey = keyof GalleryTaxonomyFilterState;
type FilterOption = { value: string; label: string };

// Key order is the render order: popover selects, then active-filter chips.
const OPTIONS: Record<
  FilterKey,
  ReadonlyArray<FilterOption>
> = {
  effect: [{ value: "all", label: "Any" }],
  viewing: [
    { value: "all", label: "Any" },
    { value: "open-eye", label: "Open-eye" },
    { value: "closed-eye", label: "Closed-eye" },
  ],
  family: [
    { value: "all", label: "Any" },
    { value: "experiential-replication", label: "Experiential replications" },
    { value: "visionary-psychedelic-art", label: "Visionary psychedelic art" },
    { value: "traditional-cultural-art", label: "Traditional cultural art" },
    { value: "dark-surrealism", label: "Dark surrealism" },
    { value: "optical-perceptual-art", label: "Optical and perceptual art" },
    { value: "generative-abstract-art", label: "Generative abstract art" },
    { value: "effect-illustration", label: "Effect illustrations" },
    { value: "explanatory-figure", label: "Explanatory figures" },
    { value: "uncertain", label: "Unclassified content" },
  ],
  artistType: [
    { value: "all", label: "Any" },
    { value: "replicator", label: "Replicators" },
    {
      value: "traditional-psychedelic-artist",
      label: "Traditional psychedelic artists",
    },
  ],
  drug: [{ value: "all", label: "Any" }],
  drugClass: [
    { value: "all", label: "Any" },
    { value: "psychedelics", label: "Psychedelics" },
    { value: "dissociatives", label: "Dissociatives" },
    { value: "deliriants", label: "Deliriants" },
    { value: "other", label: "Other" },
  ],
};

// Selects rendered as a flat list, then the "Named in the title" sub-group.
const GENERAL_KEYS = ["effect", "viewing", "family", "artistType"] as const;
const TITLE_KEYS = ["drug", "drugClass"] as const;

const LABELS: Record<FilterKey, string> = {
  viewing: "Viewing mode",
  artistType: "Artist practice",
  effect: "Depicted effect",
  drug: "Drug",
  drugClass: "Drug class",
  family: "Content family",
};

/** Chip prefixes stay self-contained: a bare "Drug class: Psychedelics" must
 *  not read as a depicted-effect chip once the popover's group heading (which
 *  carries the "named in the title" meaning) is out of sight. */
const CHIP_LABELS: Record<FilterKey, string> = {
  ...LABELS,
  drug: "Drug in title",
  drugClass: "Drug class in title",
};

export interface ReplicationTaxonomyFiltersProps {
  filters: GalleryTaxonomyFilterState;
  onChange: (filters: GalleryTaxonomyFilterState) => void;
  onClear: () => void;
  drugOptions: ReadonlyArray<FilterOption>;
  effectOptions: ReadonlyArray<FilterOption>;
  className?: string;
}

export function ReplicationTaxonomyFilters({
  filters,
  onChange,
  onClear,
  drugOptions,
  effectOptions,
  className,
}: ReplicationTaxonomyFiltersProps) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveTaxonomyFilters(filters);

  const update = (key: FilterKey, value: string) => {
    onChange({ ...filters, [key]: value } as GalleryTaxonomyFilterState);
  };

  const renderSelect = (key: FilterKey) => (
    <label key={key} className="block space-y-1.5">
      <span className="theme-text-faint text-xs font-medium uppercase tracking-[0.14em]">
        {LABELS[key]}
      </span>
      <Select value={filters[key]} onValueChange={(value) => update(key, value)}>
        <SelectTrigger
          selectSize="sm"
          aria-label={CHIP_LABELS[key]}
          className="min-h-11 sm:min-h-0"
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
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Phones get a square icon button (the count rides the glyph's corner)
            so the control bar fits one row; from `sm` up the label and inline
            count return. The aria-label carries the count at every width. */}
        <Button
          type="button"
          variant="pill"
          size="auto"
          className={cn(
            "relative h-10 w-10 shrink-0 gap-1.5 p-0 text-sm [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 sm:h-auto sm:w-auto sm:px-3.5 sm:py-1.5 sm:[@media(pointer:coarse)]:h-auto sm:[@media(pointer:coarse)]:w-auto sm:[@media(pointer:coarse)]:min-h-11",
            className,
          )}
          aria-label={
            activeCount > 0
              ? `Filters, ${activeCount} active`
              : "Filters"
          }
        >
          <Icon icon="lucide:sliders-horizontal" className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 ? (
            <span className="theme-badge-surface absolute right-1 top-1 min-w-4 rounded-full px-1 text-[0.625rem] font-semibold leading-4 text-dose-accent-strong sm:static sm:min-w-0 sm:px-1.5 sm:text-[0.6875rem] sm:leading-normal">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={8}
        className="max-h-[min(var(--radix-popover-content-available-height),38rem)] w-[calc(100vw-1rem)] space-y-4 overflow-y-auto sm:w-80"
      >
        {GENERAL_KEYS.map(renderSelect)}

        <fieldset className="space-y-4 rounded-xl border border-dose-divider p-3">
          <legend className="theme-text-faint px-1 text-xs font-semibold uppercase tracking-[0.14em]">
            Named in the title
          </legend>
          {TITLE_KEYS.map(renderSelect)}
        </fieldset>

        {/* Sticky so Clear/Done stay reachable while the list scrolls; the
            negative margins let the row own the popover's bottom padding, and
            theme-overlay-surface repaints the popover's own opaque material
            (all four appearance matrix points restyle that class together). */}
        <div className="theme-overlay-surface sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center justify-between gap-3 border-t px-4 py-3">
          <p className="theme-text-faint flex-1 text-xs">
            Filtering by a tag hides works nobody has tagged yet.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 sm:min-h-0"
            disabled={activeCount === 0}
            onClick={onClear}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="accent"
            size="sm"
            className="min-h-11 sm:min-h-0"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface ReplicationActiveFilterChipsProps {
  filters: GalleryTaxonomyFilterState;
  onChange: (filters: GalleryTaxonomyFilterState) => void;
  drugOptions: ReadonlyArray<FilterOption>;
  effectOptions: ReadonlyArray<FilterOption>;
  className?: string;
}

/**
 * Slim row of removable chips, one per active taxonomy filter — the visible
 * counterpart of the popover's count badge. Shares the popover's option
 * labels and the same whole-state `onChange`, so removing a chip is exactly
 * a select flipping back to "all" (URL params and corpus update together).
 * Renders nothing while every filter is at its default.
 */
export function ReplicationActiveFilterChips({
  filters,
  onChange,
  drugOptions,
  effectOptions,
  className,
}: ReplicationActiveFilterChipsProps) {
  const active = (Object.keys(OPTIONS) as FilterKey[]).filter(
    (key) => filters[key] !== "all",
  );
  if (active.length === 0) return null;

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
    return pool.find((option) => option.value === value)?.label ?? value;
  };

  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {active.map((key) => (
        <li key={key}>
          <Button
            type="button"
            variant="pill"
            size="pill"
            aria-label={`Remove ${CHIP_LABELS[key]} filter: ${valueLabel(key)}`}
            onClick={() =>
              onChange({ ...filters, [key]: "all" } as GalleryTaxonomyFilterState)
            }
            className="gap-1.5 px-3 py-1 text-xs [@media(pointer:coarse)]:min-h-11"
          >
            <span className="theme-text-faint" aria-hidden>
              {CHIP_LABELS[key]}:
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
