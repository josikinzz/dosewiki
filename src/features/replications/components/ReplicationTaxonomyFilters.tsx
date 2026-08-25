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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/common/Icon";
import {
  countActiveTaxonomyFilters,
  type GalleryMode,
  type GalleryTaxonomyFilterState,
} from "@/features/effects/gallery/galleryModel";
import { cn } from "@/lib/utils";

type FilterKey = keyof GalleryTaxonomyFilterState;
type FilterOption = { value: string; label: string };

const OPTIONS: Record<
  FilterKey,
  ReadonlyArray<FilterOption>
> = {
  status: [
    { value: "all", label: "All review states" },
    { value: "replication", label: "Confirmed replication" },
    { value: "unclear", label: "Unclear" },
    { value: "unreviewed", label: "Unreviewed" },
    { value: "source-corrupt", label: "Source unavailable" },
  ],
  viewing: [
    { value: "all", label: "Open or closed eye" },
    { value: "open-eye", label: "Open-eye" },
    { value: "closed-eye", label: "Closed-eye" },
  ],
  artistType: [
    { value: "all", label: "All artist practices" },
    { value: "replicator", label: "Replicators" },
    {
      value: "traditional-psychedelic-artist",
      label: "Traditional psychedelic artists",
    },
  ],
  drug: [{ value: "all", label: "Any explicitly named drug" }],
  drugClass: [
    { value: "all", label: "Any named drug class" },
    { value: "psychedelics", label: "Psychedelics" },
    { value: "dissociatives", label: "Dissociatives" },
    { value: "deliriants", label: "Deliriants" },
    { value: "other", label: "Other" },
  ],
  family: [
    { value: "all", label: "All content families" },
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
};

const LABELS: Record<FilterKey, string> = {
  status: "Review status",
  viewing: "Viewing mode",
  artistType: "Artist practice",
  drug: "Drug named in title",
  drugClass: "Drug class in title",
  family: "Content family",
};

export interface ReplicationTaxonomyFiltersProps {
  filters: GalleryTaxonomyFilterState;
  mode: GalleryMode;
  onModeChange: (mode: GalleryMode) => void;
  onChange: (filters: GalleryTaxonomyFilterState) => void;
  onClear: () => void;
  drugOptions: ReadonlyArray<FilterOption>;
  className?: string;
}

export function ReplicationTaxonomyFilters({
  filters,
  mode,
  onModeChange,
  onChange,
  onClear,
  drugOptions,
  className,
}: ReplicationTaxonomyFiltersProps) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveTaxonomyFilters(filters);

  const update = (key: FilterKey, value: string) => {
    onChange({ ...filters, [key]: value } as GalleryTaxonomyFilterState);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="pill"
          size="pill"
          className={cn("shrink-0 gap-1.5", className)}
          aria-label={
            activeCount > 0
              ? `Filters, ${activeCount} active`
              : "Filters"
          }
        >
          <Icon icon="lucide:sliders-horizontal" className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 ? (
            <span className="theme-badge-surface rounded-full px-1.5 text-[0.6875rem] font-semibold text-dose-accent-strong">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={8}
        className="max-h-[min(80vh,38rem)] w-[calc(100vw-1rem)] space-y-4 overflow-y-auto sm:w-80"
      >
        <div className="sm:hidden">
          <p className="theme-text-faint mb-2 text-xs font-medium uppercase tracking-[0.14em]">
            Browse by
          </p>
          <ToggleGroup
            type="single"
            variant="pill"
            value={mode}
            onValueChange={(value) => {
              if (!value) return;
              setOpen(false);
              onModeChange(value as GalleryMode);
            }}
            aria-label="Browse by"
          >
            <ToggleGroupItem value="artist" className="min-h-11 flex-1">
              By artist
            </ToggleGroupItem>
            <ToggleGroupItem value="effect" className="min-h-11 flex-1">
              By effect
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {(Object.keys(OPTIONS) as FilterKey[]).map((key) => (
          <label key={key} className="block space-y-1.5">
            <span className="theme-text-faint text-xs font-medium uppercase tracking-[0.14em]">
              {LABELS[key]}
            </span>
            <Select value={filters[key]} onValueChange={(value) => update(key, value)}>
              <SelectTrigger selectSize="sm" aria-label={LABELS[key]}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(key === "drug"
                  ? [...OPTIONS.drug, ...drugOptions]
                  : OPTIONS[key]
                ).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ))}

        <div className="flex items-center justify-between border-t border-dose-divider pt-3">
          <p className="theme-text-faint text-xs">
            Untagged works stay visible under All.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={activeCount === 0}
            onClick={onClear}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
