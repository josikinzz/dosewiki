import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Surface } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { slugify } from "@/utils/slug";
import type { AddSlugFilterMode, SubstanceOption } from "./types";

const formatSubstanceLabel = (option: SubstanceOption): string => {
  const parts = [option.name];
  if (option.alias) {
    parts.push(`(${option.alias})`);
  }
  if (option.isHidden) {
    parts.push("[Hidden]");
  }
  return parts.join(" ");
};

interface AddSubstanceControlProps {
  label: string;
  existingSlugs: string[];
  onAdd: (slug: string) => void;
  options: SubstanceOption[];
  filterContext: {
    sectionSlugs: ReadonlySet<string>;
    categorySlugs: ReadonlySet<string>;
    datasetSlugs: ReadonlySet<string>;
  };
}

export function AddSubstanceControl({
  label,
  existingSlugs,
  onAdd,
  options,
  filterContext,
}: AddSubstanceControlProps) {
  const filterSelectId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [filterMode, setFilterMode] = useState<AddSlugFilterMode>("all");

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setShowPicker(false);
    setValue("");
    setError(null);
  }, []);

  const existingSet = useMemo(() => new Set(existingSlugs.map((slug) => slugify(slug))), [existingSlugs]);

  const filteredOptions = useMemo(() => {
    if (filterMode === "all") {
      return options;
    }

    const scope =
      filterMode === "missing-section"
        ? filterContext.sectionSlugs
        : filterMode === "missing-category"
          ? filterContext.categorySlugs
          : filterContext.datasetSlugs;

    return options.filter((option) => {
      const normalized = slugify(option.slug);
      if (!normalized) {
        return false;
      }
      return !scope.has(normalized);
    });
  }, [filterContext.categorySlugs, filterContext.datasetSlugs, filterContext.sectionSlugs, filterMode, options]);

  useEffect(() => {
    if (!showPicker) {
      setFilterMode("all");
    }
  }, [showPicker]);

  const handleSubmit = useCallback(() => {
    const normalized = slugify(value);
    if (!normalized) {
      setError("Enter a substance slug");
      return;
    }
    if (existingSet.has(normalized)) {
      setError("Substance already listed");
      return;
    }
    onAdd(normalized);
    setValue("");
    setError(null);
  }, [existingSet, onAdd, value]);

  const handleSelect = useCallback(
    (slug: string) => {
      if (!slug) {
        return;
      }
      if (existingSet.has(slug)) {
        setError("Substance already listed");
        return;
      }
      onAdd(slug);
      setShowPicker(false);
      setError(null);
    },
    [existingSet, onAdd],
  );

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="theme-text-muted -ml-2 justify-start gap-1.5"
        aria-expanded={false}
      >
        <Icon icon="lucide:plus" className="h-3.5 w-3.5" size={14} />
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSubmit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              handleClose();
            }
          }}
          className="flex-1 bg-transparent"
          placeholder="Substance slug…"
          aria-label={label}
          // Focus moves into the disclosure the user just opened, not on page load.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            size="icon"
            onClick={handleSubmit}
            aria-label={label}
          >
            <Icon icon="lucide:plus-circle" className="h-3.5 w-3.5" size={14} />
          </Button>
          <Button
            variant="glass"
            size="icon"
            onClick={() => setShowPicker((previous) => !previous)}
            aria-expanded={showPicker}
            aria-label="Browse substances"
          >
            <Icon icon="lucide:list-filter" className="h-3.5 w-3.5" size={14} />
          </Button>
          <Button
            variant="glass"
            size="icon"
            onClick={handleClose}
            aria-label="Close add substance"
          >
            <Icon icon="lucide:x" className="h-3.5 w-3.5" size={14} />
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-[color:var(--theme-danger-text)]">{error}</p> : null}
      {showPicker && (
        <Surface variant="muted" padding="xs" radius="lg">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <span className="theme-text-muted text-xs font-semibold uppercase tracking-wide">Select a substance</span>
            <div className="flex items-center gap-2">
              <label className="theme-text-faint text-[10px] uppercase tracking-[0.3em]" htmlFor={filterSelectId}>
                Filter
              </label>
              <Select value={filterMode} onValueChange={(value) => setFilterMode(value as AddSlugFilterMode)}>
                <SelectTrigger id={filterSelectId} selectSize="compact" className="w-auto min-w-[11rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All drugs</SelectItem>
                  <SelectItem value="missing-section">Missing from section</SelectItem>
                  <SelectItem value="missing-category">Missing from category</SelectItem>
                  <SelectItem value="missing-index">Missing from index</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="glass"
                size="icon"
                onClick={() => setShowPicker(false)}
                className={`h-6 w-6 ${TOUCH_ICON}`}
                aria-label="Close substance picker"
              >
                <Icon icon="lucide:x" className="h-3 w-3" size={12} />
              </Button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {filteredOptions.map((option) => (
                  <li key={option.slug}>
                    <Button
                      variant="listItem"
                      size="auto"
                      className="px-2 py-1"
                      onClick={() => handleSelect(option.slug)}
                    >
                      {formatSubstanceLabel(option)}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="theme-text-muted px-2 py-4 text-sm">No substances match this filter.</p>
            )}
          </div>
        </Surface>
      )}
    </div>
  );
}
