"use client";

import { useMemo, useState, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorField, EditorFieldRow } from "@/features/dev/components";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import { SearchablePicker, type SearchablePickerOption } from "@/features/dev/components/SearchablePicker";
import { cn } from "@/lib/utils";

import { countNoun, datePresetFor, type DatePreset } from "./changeLogModel";
import type { ChangeLogController } from "./useDevModeChangeLog";

const DATE_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "any", label: "Any date" },
  { value: "7", label: "Past 7 days" },
  { value: "30", label: "Past 30 days" },
  { value: "custom", label: "Custom" },
];

type ChangeLogFiltersProps = {
  controller: ChangeLogController;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Display name for a submitter stamp. */
  nameFor: (key: string) => string;
  /** Show the `/` key cap in the search field (the tab binds it). */
  searchKey: boolean;
};

/**
 * Search, article, date and submitter filters. Search always shows; below
 * `lg` the rest folds behind a Filters button that carries the active count,
 * so a phone opens on saves rather than a screen of fields.
 */
export function ChangeLogFilters({ controller, searchRef, nameFor, searchKey }: ChangeLogFiltersProps) {
  const {
    filters,
    articleOptions,
    articleFrequency,
    submitterOptions,
    activeFilterCount,
    handleArticleSelect,
    handleSubmitterSelect,
    handleSearchChange,
    handleDateChange,
    applyQuickDateRange,
    setDateRange,
    clearFilters,
  } = controller;
  const [moreOpen, setMoreOpen] = useState(false);
  // "Custom" with no dates yet still shows the two date fields.
  const [customPicked, setCustomPicked] = useState(false);

  const preset = customPicked ? "custom" : datePresetFor(filters.startDate, filters.endDate);
  const reversed = Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate);
  // The search counts in the Filters badge only when it is not the field beside it.
  const foldedCount = activeFilterCount - (filters.searchQuery.trim() ? 1 : 0);

  const saveCounts = useMemo(
    () => new Map(articleFrequency.map((article) => [article.slug, article.count])),
    [articleFrequency],
  );
  const articlePickerOptions = useMemo<SearchablePickerOption[]>(
    () =>
      articleOptions.map((option) => ({
        value: option.slug,
        label: option.title,
        hint: countNoun(saveCounts.get(option.slug) ?? 0, "loaded save"),
      })),
    [articleOptions, saveCounts],
  );
  const submitterPickerOptions = useMemo<SearchablePickerOption[]>(
    () =>
      submitterOptions.map((option) => ({
        value: option.key,
        label: nameFor(option.key),
        hint: countNoun(option.count, "loaded save"),
      })),
    [nameFor, submitterOptions],
  );

  const pickDate = (value: string) => {
    if (value === "custom") {
      setCustomPicked(true);
      return;
    }
    setCustomPicked(false);
    applyQuickDateRange(value === "any" ? null : Number(value));
  };

  return (
    <div className="space-y-4">
      {/* On phones the heading only earns its row when there is something to clear. */}
      <div className={cn("items-center justify-between gap-3", activeFilterCount > 0 ? "flex" : "hidden lg:flex")}>
        <h2 className="type-meta-label theme-text-muted">Filters</h2>
        {activeFilterCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setCustomPicked(false);
              clearFilters();
            }}
          >
            Clear all
            <span className="sr-only">{` ${countNoun(activeFilterCount, "filter")}`}</span>
          </Button>
        ) : null}
      </div>

      <div role="search" aria-label="Saves">
        <EditorField label="Search" htmlFor="change-log-search">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                ref={searchRef}
                id="change-log-search"
                type="search"
                inputSize="sm"
                placeholder="Search saves"
                value={filters.searchQuery}
                onChange={handleSearchChange}
                aria-keyshortcuts={searchKey ? "/" : undefined}
                aria-describedby="change-log-search-help"
                className={cn(searchKey && "pr-9")}
              />
              {searchKey && !filters.searchQuery ? (
                <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center [@media(pointer:coarse)]:hidden">
                  <kbd aria-hidden className="theme-dev-kbd">/</kbd>
                </span>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 lg:hidden"
              aria-expanded={moreOpen}
              aria-controls="change-log-more-filters"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <Icon icon="lucide:sliders-horizontal" size={16} />
              Filters
              {foldedCount > 0 ? (
                <>
                  <Badge variant="secondary" aria-hidden>
                    {foldedCount}
                  </Badge>
                  <span className="sr-only">{`, ${foldedCount} active`}</span>
                </>
              ) : null}
            </Button>
          </div>
        </EditorField>
        <p id="change-log-search-help" className="theme-text-faint mt-1.5 text-xs max-lg:sr-only">Matches words in the save, its diff, article names and who saved it.</p>
      </div>

      <div id="change-log-more-filters" className={cn("space-y-4", moreOpen ? "block" : "hidden lg:block")}>
        <EditorField label="Article" htmlFor="change-log-article">
          <SearchablePicker
            id="change-log-article"
            options={articlePickerOptions}
            value={filters.articleSlug}
            onChange={(slug) => handleArticleSelect(slug ?? "__all__")}
            placeholder="All articles"
            emptyText="No loaded save touches an article by that name."
          />
        </EditorField>

        <EditorField label="Saved by" htmlFor="change-log-submitter">
          <SearchablePicker
            id="change-log-submitter"
            options={submitterPickerOptions}
            value={filters.submitter}
            onChange={handleSubmitterSelect}
            placeholder="Anyone"
            emptyText="No loaded save is stamped with that name."
            disabled={submitterPickerOptions.length === 0}
          />
        </EditorField>

        <fieldset className="space-y-2">
          <legend className="theme-text-secondary mb-2 text-sm font-medium">Date</legend>
          {/* Four choices in two rows: the 17rem column cannot hold one strip without hiding some. */}
          <div
            role="group"
            aria-label="Date range"
            className="grid grid-cols-2 gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1"
          >
            {DATE_OPTIONS.map((option) => {
              const selected = option.value === preset;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={selected ? "pillActive" : "ghostPill"}
                  size="pill"
                  aria-pressed={selected}
                  onClick={() => pickDate(option.value)}
                  className={cn("w-full rounded-control [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:min-h-0", TOUCH_HALO_Y)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
          {preset === "custom" ? (
            <div className="space-y-2 pt-1">
              <EditorFieldRow layout="twoColumn">
                <EditorField label="From" htmlFor="change-log-start">
                  <Input
                    id="change-log-start"
                    type="date"
                    inputSize="sm"
                    value={filters.startDate ?? ""}
                    max={filters.endDate ?? undefined}
                    onChange={handleDateChange("startDate")}
                  />
                </EditorField>
                <EditorField label="To" htmlFor="change-log-end">
                  <Input
                    id="change-log-end"
                    type="date"
                    inputSize="sm"
                    value={filters.endDate ?? ""}
                    min={filters.startDate ?? undefined}
                    onChange={handleDateChange("endDate")}
                  />
                </EditorField>
              </EditorFieldRow>
              {reversed ? (
                <p role="status" className="theme-warning-text-strong flex flex-wrap items-center gap-x-2 text-xs">
                  <span>The start is after the end, so no save can match.</span>
                  <Button
                    type="button"
                    variant="link"
                    size="auto"
                    className="h-auto p-0 text-xs"
                    onClick={() => setDateRange(filters.endDate, filters.startDate)}
                  >
                    Swap the dates
                  </Button>
                </p>
              ) : (
                <p className="theme-text-faint text-xs">Days start and end at midnight where you are.</p>
              )}
            </div>
          ) : null}
        </fieldset>
      </div>
    </div>
  );
}
