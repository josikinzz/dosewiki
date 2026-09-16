"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { fetchGalleryCandidates } from "./substanceGalleryApi";
import type { GalleryCandidate } from "./substanceGalleryPortalModel";

const MAX_VISIBLE_TARGETS = 40;

export type SubstanceTargetPickerProps = {
  substances?: readonly GalleryCandidate[];
  selectedSlugs: readonly string[];
  onSelectedSlugsChange: (slugs: string[]) => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
};

type CandidateState =
  | { status: "idle"; candidates: GalleryCandidate[] }
  | { status: "loading"; candidates: GalleryCandidate[] }
  | { status: "ready"; candidates: GalleryCandidate[] }
  | { status: "error"; candidates: GalleryCandidate[]; message: string };

export function SubstanceTargetPicker({
  substances,
  selectedSlugs,
  onSelectedSlugsChange,
  disabled = false,
  busy = false,
  label = "Drug targets",
}: SubstanceTargetPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<CandidateState>(() =>
    substances
      ? { status: "ready", candidates: [...substances] }
      : { status: "idle", candidates: [] },
  );
  const hasLoadedRef = useRef(Boolean(substances));

  useEffect(() => {
    if (substances) {
      hasLoadedRef.current = true;
      setLoaded({ status: "ready", candidates: [...substances] });
      return;
    }
    if (!open || hasLoadedRef.current) {
      return;
    }
    let cancelled = false;
    setLoaded({ status: "loading", candidates: [] });
    void fetchGalleryCandidates().then((result) => {
      if (cancelled) return;
      setLoaded(
        result.status === "ready"
          ? (() => {
              hasLoadedRef.current = true;
              return { status: "ready" as const, candidates: result.candidates };
            })()
          : { status: "error", candidates: [], message: result.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, substances]);

  const selected = useMemo(() => new Set(selectedSlugs), [selectedSlugs]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return loaded.candidates.filter(
      (candidate) =>
        needle.length === 0
        || candidate.title.toLowerCase().includes(needle)
        || candidate.slug.toLowerCase().includes(needle),
    );
  }, [loaded.candidates, query]);
  const renderedCandidates = visible.slice(0, MAX_VISIBLE_TARGETS);
  const selectedCandidates = useMemo(() => {
    const bySlug = new Map(loaded.candidates.map((candidate) => [candidate.slug, candidate]));
    return selectedSlugs.map((slug) => bySlug.get(slug) ?? {
      slug,
      title: slug,
      match_count: 0,
      curated: false,
      curated_count: 0,
      removed_count: 0,
    });
  }, [loaded.candidates, selectedSlugs]);
  const unavailable = disabled || busy;

  return (
    <div className="space-y-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (unavailable) return;
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label={`${label}. ${selectedSlugs.length} selected`}
            disabled={unavailable}
          >
            <Icon
              icon={busy || loaded.status === "loading" ? "lucide:loader-circle" : "lucide:plus"}
              size={14}
              className={busy || loaded.status === "loading" ? "animate-spin" : undefined}
            />
            {busy
              ? "Applying…"
              : `Choose drugs${selectedSlugs.length > 0 ? ` (${selectedSlugs.length})` : ""}`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-2rem)] p-0 sm:w-[25rem]" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search every drug by name or slug…"
              disabled={disabled || busy}
            />
            <CommandList className="max-h-[min(24rem,60vh)]">
              {visible.length === 0 ? (
                <p className="theme-text-muted px-3 py-6 text-center text-sm">
                  {loaded.status === "loading"
                    ? "Loading every drug…"
                    : loaded.status === "error"
                      ? loaded.message
                      : "No drugs found"}
                </p>
              ) : (
                <>
                  <div className="p-1">
                    {renderedCandidates.map((candidate) => {
                      const active = selected.has(candidate.slug);
                      return (
                        <CommandItem
                          key={candidate.slug}
                          value={candidate.slug}
                          aria-selected={active}
                          disabled={disabled || busy}
                          onSelect={() => {
                            onSelectedSlugsChange(
                              active
                                ? selectedSlugs.filter((slug) => slug !== candidate.slug)
                                : [...selectedSlugs, candidate.slug],
                            );
                          }}
                        >
                          <Icon icon={active ? "lucide:check-square" : "lucide:square"} size={15} />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {candidate.title}
                          </span>
                          <span className="theme-text-faint shrink-0 text-xs">{candidate.slug}</span>
                        </CommandItem>
                      );
                    })}
                  </div>
                  {renderedCandidates.length < visible.length ? (
                    <p className="theme-text-muted border-t border-[color:var(--editor-panel-border)] px-3 py-2 text-xs">
                      Showing the first {renderedCandidates.length} of {visible.length}. Type to
                      narrow the list.
                    </p>
                  ) : null}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div aria-live="polite" className="flex min-h-7 flex-wrap items-center gap-1.5">
        {selectedCandidates.length === 0 ? (
          <span className="theme-text-faint text-xs">No drug targets selected.</span>
        ) : (
          selectedCandidates.map((candidate) => (
            <span
              key={candidate.slug}
              className={cn(
                "theme-replication-association-row inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-xs",
                busy && "opacity-60",
              )}
            >
              <span className="truncate">{candidate.title}</span>
              <button
                type="button"
                className="theme-text-faint rounded-full p-0.5 transition-opacity hover:opacity-100 theme-focus-ring"
                aria-label={`Remove ${candidate.title}`}
                disabled={disabled || busy}
                onClick={() =>
                  onSelectedSlugsChange(selectedSlugs.filter((slug) => slug !== candidate.slug))
                }
              >
                <Icon icon="lucide:x" size={12} />
              </button>
            </span>
          ))
        )}
      </div>
      {loaded.status === "error" && !open ? (
        <p className="theme-danger-text text-xs">{loaded.message}</p>
      ) : null}
    </div>
  );
}
