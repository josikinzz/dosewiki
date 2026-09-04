"use client";

/**
 * Substance picker for the gallery curation portal.
 *
 * The trigger is the current substance; behind it sits a searchable flat list
 * with a curated dot and a `N matches · M curated` right rail on every row.
 *
 * The addition over the old inline combobox is the **needs-curation worklist**:
 * a toggle that drops every substance with stored curation and orders the rest
 * by match count, so the picker stops being a directory and becomes the queue
 * an editor actually works down. In that mode the dot (uniformly "never
 * curated") is replaced by the row's 1-based queue position.
 *
 * `status` drives the trigger: while the batched substance read walks the
 * whole article table the trigger renders disabled rather than not at all,
 * because a toolbar that appears late shifts everything beside it. When that
 * read fails the trigger stays disabled and says so; the retry lives in the
 * notice beside it, never a spinner next to a failure.
 */

import { useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { GalleryCandidate } from "./substanceGalleryPortalModel";

export type GalleryPickerProps = {
  candidates: readonly GalleryCandidate[];
  currentSlug: string | null;
  onSelect: (slug: string) => void;
  status: "loading" | "ready" | "error";
};

function matchLabel(candidate: GalleryCandidate): string {
  const matches =
    candidate.match_count > 0
      ? `${candidate.match_count} match${candidate.match_count === 1 ? "" : "es"}`
      : "no matches";
  return candidate.curated ? `${matches} · ${candidate.curated_count} curated` : matches;
}

export function GalleryPicker({ candidates, currentSlug, onSelect, status }: GalleryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Session-only: a queue you are working down should not survive a reload. */
  const [worklistOnly, setWorklistOnly] = useState(false);

  const current = candidates.find((candidate) => candidate.slug === currentSlug) ?? null;
  const pendingCount = useMemo(
    () => candidates.reduce((total, candidate) => (candidate.curated ? total : total + 1), 0),
    [candidates],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let rows = candidates.filter(
      (candidate) =>
        needle.length === 0
        || candidate.title.toLowerCase().includes(needle)
        || candidate.slug.toLowerCase().includes(needle),
    );
    if (worklistOnly) {
      rows = rows
        .filter((candidate) => !candidate.curated)
        .slice()
        .sort((a, b) => b.match_count - a.match_count || a.title.localeCompare(b.title));
    }
    return rows;
  }, [candidates, query, worklistOnly]);

  const triggerLabel =
    status === "loading"
      ? "Loading substances…"
      : status === "error"
        ? "Substance list unavailable"
        : (current?.title ?? "Choose a substance");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="glass"
          size="auto"
          role="combobox"
          disabled={status !== "ready"}
          aria-expanded={open}
          aria-label={
            status === "loading"
              ? "Loading the substance list"
              : status === "error"
                ? "The substance list could not be loaded"
                : current
                  ? `Current substance: ${current.title}. Open the substance list`
                  : "Open the substance list"
          }
          className="min-w-[10rem] max-w-[18rem] gap-2 px-2.5 py-1.5"
        >
          {status === "loading" ? (
            <Icon icon="lucide:loader-circle" size={13} className="theme-text-faint shrink-0 animate-spin" />
          ) : status === "error" ? (
            <Icon icon="lucide:circle-alert" size={13} className="theme-text-faint shrink-0" />
          ) : current ? (
            <span
              aria-hidden
              title={current.curated ? "Curation stored" : "Never curated"}
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                current.curated ? "bg-dose-accent-strong" : "bg-[var(--editor-chip-border)]",
              )}
            />
          ) : null}
          <span className="theme-text-primary font-display min-w-[6ch] flex-1 truncate text-left text-base font-semibold leading-none">
            {triggerLabel}
          </span>
          <Icon icon="lucide:chevrons-up-down" size={14} className="theme-text-faint shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-1rem)] p-0 sm:w-[24rem]" align="start" collisionPadding={8}>
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search by name or slug…" />
          <div className="flex items-center gap-2 border-b border-[color:var(--editor-panel-border)] px-2 py-1.5">
            <Button
              type="button"
              variant={worklistOnly ? "pillActive" : "pill"}
              size="chip"
              aria-pressed={worklistOnly}
              // Keep the caret in the search field: the toggle narrows the list
              // you are already typing against.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setWorklistOnly((active) => !active)}
            >
              <Icon icon={worklistOnly ? "lucide:list-checks" : "lucide:list"} size={12} />
              Needs curation ({pendingCount})
            </Button>
            <span className="theme-text-faint ml-auto shrink-0 text-[11px]">
              {worklistOnly ? "most matches first" : "all substances"}
            </span>
          </div>
          <CommandList className="max-h-[min(24rem,60vh)]">
            {visible.length === 0 ? (
              <div className="theme-text-muted py-6 text-center text-sm">
                {worklistOnly
                  ? "Nothing left in the worklist: every substance here has stored curation."
                  : "No substances found"}
              </div>
            ) : (
              <div className="p-1">
                {visible.map((candidate, index) => (
                  <CommandItem
                    key={candidate.slug}
                    value={candidate.slug}
                    onSelect={() => {
                      onSelect(candidate.slug);
                      setOpen(false);
                    }}
                    className={cn(candidate.slug === currentSlug && "theme-text-primary font-semibold")}
                  >
                    {worklistOnly ? (
                      <span className="theme-text-faint w-5 shrink-0 text-right text-[11px] tabular-nums">
                        {index + 1}
                      </span>
                    ) : (
                      <span
                        aria-hidden
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          candidate.curated ? "bg-dose-accent-strong" : "bg-[var(--editor-chip-border)]",
                        )}
                      />
                    )}
                    <span className="truncate font-medium">{candidate.title}</span>
                    <span className="theme-text-faint ml-1 hidden shrink-0 text-xs sm:inline">
                      {candidate.slug}
                    </span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 text-xs tabular-nums",
                        candidate.match_count > 0 ? "theme-text-muted" : "theme-text-faint",
                      )}
                    >
                      {matchLabel(candidate)}
                    </span>
                  </CommandItem>
                ))}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
