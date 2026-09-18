"use client";

import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagToken } from "@/features/dev/components";
import { cn } from "@/lib/utils";

import type { StudioEffectOption } from "./replicationStudioModel";

export type EffectTagInputProps = {
  id: string;
  /** Effect slugs already on the row. */
  value: readonly string[];
  onChange: (next: string[]) => void;
  options: readonly StudioEffectOption[];
  placeholder?: string;
  disabled?: boolean;
};

const MAX_SUGGESTIONS = 8;

/**
 * Chip input over the published subjective-effect list.
 *
 * Chips store effect slugs (what Postgres keeps) but show effect names (what the
 * editor reads), so the stored value stays joinable while the control stays
 * legible. Free text is deliberately not accepted: a tag that names no effect
 * could never be joined back to one, and the column exists to be joined.
 */
export function EffectTagInput({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: EffectTagInputProps) {
  const [draft, setDraft] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const nameBySlug = useMemo(
    () => new Map(options.map((option) => [option.slug, option.name])),
    [options],
  );

  const suggestions = useMemo(() => {
    const needle = draft.trim().toLowerCase();
    if (!needle) return [];
    return options
      .filter((option) => !value.includes(option.slug))
      .filter((option) => option.name.toLowerCase().includes(needle) || option.slug.includes(needle))
      .slice(0, MAX_SUGGESTIONS);
  }, [draft, options, value]);

  const addTag = (slug: string) => {
    if (!slug || value.includes(slug)) return;
    onChange([...value, slug]);
    setDraft("");
    setActiveIndex(-1);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-xl border border-[color:var(--editor-panel-border)] theme-replication-field p-2",
          disabled ? "opacity-60" : undefined,
        )}
      >
        {value.map((slug) => (
          <TagToken
            key={slug}
            variant="compact"
            label={nameBySlug.get(slug) ?? slug}
            disabled={disabled}
            removeLabel={`Remove tag ${nameBySlug.get(slug) ?? slug}`}
            onRemove={() => onChange(value.filter((entry) => entry !== slug))}
          />
        ))}
        <Input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={`${id}-suggestions`}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={draft}
          placeholder={placeholder ?? (value.length > 0 ? "Add effect…" : "Type to search effects…")}
          className="theme-elevation-none h-7 min-w-[10rem] flex-1 border-0 bg-transparent px-1 focus-visible:ring-0"
          onChange={(event) => {
            setDraft(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onBlur={() => {
            // Late enough for a suggestion's mousedown to land first.
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const picked = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
              if (picked) addTag(picked.slug);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, -1));
              return;
            }
            if (event.key === "Backspace" && draft.length === 0 && value.length > 0) {
              onChange(value.slice(0, -1));
              return;
            }
            if (event.key === "Escape" && open) {
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </div>

      {open && suggestions.length > 0 ? (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[color:var(--editor-panel-border)] theme-replication-suggestions p-1"
        >
          {suggestions.map((option, index) => (
            <li key={option.slug} role="option" aria-selected={index === activeIndex}>
              <Button
                type="button"
                variant={index === activeIndex ? "suggestionActive" : "suggestion"}
                size="suggestion"
                onMouseDown={(event) => {
                  event.preventDefault();
                  addTag(option.slug);
                }}
              >
                <span className="truncate">{option.name}</span>
                <span className="theme-text-faint font-mono text-[11px]">{option.slug}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
