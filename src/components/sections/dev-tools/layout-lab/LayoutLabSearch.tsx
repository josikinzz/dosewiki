import { FormEvent } from "react";
import { Search } from "lucide-react";

import { IconBadge } from "../../../common/IconBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { LayoutLabOption } from "./useLayoutLabSelection";

interface LayoutLabSearchProps {
  query: string;
  onQueryChange: (value: string) => void;
  suggestions: LayoutLabOption[];
  onSelect: (slug: string) => void;
  activeSlug?: string | null;
}

export function LayoutLabSearch({
  query,
  onQueryChange,
  suggestions,
  onSelect,
  activeSlug,
}: LayoutLabSearchProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const firstSuggestion = suggestions[0];
    if (firstSuggestion) {
      onSelect(firstSuggestion.slug);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-white/[0.02] p-5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]">
      <p className="flex items-center gap-3 text-sm font-semibold text-fuchsia-200">
        <IconBadge icon={Search} label="Select substance" />
        Select a substance
      </p>
      <form onSubmit={handleSubmit} className="mt-3">
        <label className="sr-only" htmlFor="layout-lab-search">
          Search for a substance
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            id="layout-lab-search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Type a drug name, alias, or slug"
            className="pl-9"
            autoComplete="off"
          />
        </div>
      </form>
      <div className="mt-4 space-y-1.5">
        {suggestions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-2 text-xs text-white/50">
            No matches. Try another spelling or alias.
          </p>
        ) : (
          suggestions.map((suggestion) => {
            const isActive = suggestion.slug === activeSlug;
            return (
              <Button
                key={suggestion.slug}
                variant={isActive ? "suggestionActive" : "suggestion"}
                size="suggestion"
                onClick={() => onSelect(suggestion.slug)}
              >
                <span>{suggestion.label}</span>
                <span className="text-[11px] uppercase tracking-[0.35em] text-white/35">#{suggestion.slug}</span>
              </Button>
            );
          })
        )}
      </div>
    </div>
  );
}
