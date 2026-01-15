import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ListFilter, PlusCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { slugify } from "../../../../utils/slug";
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
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [filterMode, setFilterMode] = useState<AddSlugFilterMode>("all");

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

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/50 p-3 shadow-inner shadow-black/20">
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
          }}
          className="flex-1 bg-transparent"
          placeholder={label}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="glass"
            size="icon"
            onClick={handleSubmit}
            className="bg-fuchsia-500/20 text-fuchsia-200 hover:bg-fuchsia-500/30"
            aria-label={label}
          >
            <PlusCircle className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="glass"
            size="icon"
            onClick={() => setShowPicker((previous) => !previous)}
            aria-expanded={showPicker}
            aria-label="Browse substances"
          >
            <ListFilter className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {showPicker && (
        <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Select a substance</span>
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/40" htmlFor={filterSelectId}>
                Filter
              </label>
              <Select value={filterMode} onValueChange={(value) => setFilterMode(value as AddSlugFilterMode)}>
                <SelectTrigger id={filterSelectId} selectSize="compact" className="w-auto min-w-[11rem] bg-slate-950/80">
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
                className="h-6 w-6"
                aria-label="Close substance picker"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              <ul className="space-y-1 text-sm text-white/80">
                {filteredOptions.map((option) => (
                  <li key={option.slug}>
                    <Button
                      variant="pickerListItem"
                      onClick={() => handleSelect(option.slug)}
                    >
                      {formatSubstanceLabel(option)}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-4 text-sm text-white/60">No substances match this filter.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
