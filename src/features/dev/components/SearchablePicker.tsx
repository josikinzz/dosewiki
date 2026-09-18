import type { ReactNode } from "react";
import { useId, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TOUCH_PILL } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import { TagToken } from "./TagToken";

/** Matches rendered per query; the corpus is thousands of profiles. */
const MAX_RENDERED_MATCHES = 50;

export interface SearchablePickerOption {
  value: string;
  label: string;
  hint?: string;
}

interface PickerBaseProps {
  id?: string;
  options: readonly SearchablePickerOption[];
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** "field" is the outlined select-like control; "quiet" is an inline add row for list feet. */
  triggerVariant?: "field" | "quiet";
}

export interface SearchablePickerProps extends PickerBaseProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export interface SearchableMultiPickerProps extends PickerBaseProps {
  value: readonly string[];
  onChange: (values: string[]) => void;
}

/**
 * Filters outside cmdk so only the first {@link MAX_RENDERED_MATCHES} rows
 * mount: cmdk scores every mounted item on each keystroke, which is fine for
 * fifty rows and not for two thousand.
 */
function useMatches(options: readonly SearchablePickerOption[], query: string, exclude?: ReadonlySet<string>) {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches: SearchablePickerOption[] = [];
    let total = 0;
    for (const option of options) {
      if (exclude?.has(option.value)) continue;
      if (
        needle.length > 0 &&
        !option.label.toLowerCase().includes(needle) &&
        !(option.hint?.toLowerCase().includes(needle) ?? false) &&
        !option.value.toLowerCase().includes(needle)
      ) {
        continue;
      }
      total += 1;
      if (matches.length < MAX_RENDERED_MATCHES) matches.push(option);
    }
    return { matches, total };
  }, [options, query, exclude]);
}

/**
 * The trigger, popover and command list both pickers share. `onPick` receives
 * the chosen value; the caller decides whether the popover closes.
 */
function PickerMenu({
  id,
  open,
  onOpenChange,
  triggerLabel,
  muted,
  disabled,
  options,
  exclude,
  placeholder,
  emptyText,
  ariaLabel,
  onPick,
  leading,
  triggerVariant = "field",
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  /** Trigger shows a placeholder rather than a chosen value. */
  muted: boolean;
  disabled?: boolean;
  options: readonly SearchablePickerOption[];
  exclude?: ReadonlySet<string>;
  placeholder: string;
  emptyText: string;
  ariaLabel?: string;
  onPick: (value: string) => void;
  leading?: ReactNode;
  triggerVariant?: "field" | "quiet";
}) {
  const [query, setQuery] = useState("");
  const { matches, total } = useMatches(options, query, exclude);
  const hidden = total - matches.length;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <PopoverTrigger asChild>
        {triggerVariant === "quiet" ? (
          <Button
            id={id}
            type="button"
            variant="ghost"
            size="auto"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              "theme-text-faint h-8 w-full justify-start gap-2 rounded-xl px-3 text-sm font-normal hover:bg-transparent",
              TOUCH_PILL,
            )}
          >
            <Icon icon="lucide:plus" size={14} className="shrink-0" />
            <span className="min-w-0 truncate text-left">{triggerLabel}</span>
          </Button>
        ) : (
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn("w-full justify-between gap-2 font-normal", muted ? "theme-text-faint" : "theme-text-primary")}
          >
            <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
            <Icon icon="lucide:chevrons-up-down" size={14} className="theme-text-faint shrink-0" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command shouldFilter={false} label={ariaLabel ?? placeholder} className="border-0">
          <CommandInput id={`${id}-search`} value={query} onValueChange={setQuery} placeholder={placeholder} />
          <CommandList className="max-h-72 [@media(pointer:coarse)]:max-h-[22rem]">
            {leading}
            {matches.length === 0 ? <CommandEmpty>{emptyText}</CommandEmpty> : null}
            {matches.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                onSelect={() => onPick(option.value)}
                className={cn("mx-1 my-0.5 first:mt-1 last:mb-1", TOUCH_PILL)}
              >
                <span className="min-w-0 flex-1">
                  <span className="theme-text-primary block truncate">{option.label}</span>
                  {option.hint ? <span className="theme-text-faint block truncate text-xs">{option.hint}</span> : null}
                </span>
              </CommandItem>
            ))}
            {hidden > 0 ? (
              <p className="theme-text-faint px-3 py-2 text-xs">
                {hidden} more {hidden === 1 ? "match" : "matches"}. Keep typing to narrow the list.
              </p>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Single-value picker for people and works. Replaces native selects with
 * hundreds of options: a search box inside a popover, at most fifty matches
 * mounted, at most eight rows visible before the list scrolls.
 */
export function SearchablePicker({
  id: idProp,
  options,
  value,
  onChange,
  placeholder,
  emptyText,
  disabled,
  ariaLabel,
  triggerVariant,
}: SearchablePickerProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const [open, setOpen] = useState(false);
  const selected = value === null ? null : (options.find((option) => option.value === value) ?? null);

  return (
    <PickerMenu
      id={id}
      open={open}
      onOpenChange={setOpen}
      triggerLabel={selected?.label ?? (value !== null ? value : placeholder)}
      muted={selected === null}
      disabled={disabled}
      options={options}
      placeholder={placeholder}
      emptyText={emptyText}
      ariaLabel={ariaLabel}
      triggerVariant={triggerVariant}
      onPick={(next) => {
        onChange(next);
        setOpen(false);
      }}
      leading={
        value !== null ? (
          <CommandItem
            value="__clear"
            onSelect={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn("theme-text-muted mx-1 mt-1", TOUCH_PILL)}
          >
            <Icon icon="lucide:x" size={14} />
            Clear selection
          </CommandItem>
        ) : null
      }
    />
  );
}

/**
 * Multi-value companion: chosen options sit above the trigger as removable
 * chips and drop out of the suggestion list.
 */
export function SearchableMultiPicker({
  id: idProp,
  options,
  value,
  onChange,
  placeholder,
  emptyText,
  disabled,
  ariaLabel,
}: SearchableMultiPickerProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const [open, setOpen] = useState(false);
  const chosen = useMemo(() => new Set(value), [value]);
  const labels = useMemo(() => new Map(options.map((option) => [option.value, option.label])), [options]);

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={ariaLabel ? `${ariaLabel}, selected` : "Selected"}>
          {value.map((item) => (
            <li key={item} className="max-w-full">
              <TagToken
                label={labels.get(item) ?? item}
                variant="interactive"
                disabled={disabled}
                removeLabel={`Remove ${labels.get(item) ?? item}`}
                onRemove={() => onChange(value.filter((existing) => existing !== item))}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <PickerMenu
        id={id}
        open={open}
        onOpenChange={setOpen}
        triggerLabel={placeholder}
        muted
        disabled={disabled}
        options={options}
        exclude={chosen}
        placeholder={placeholder}
        emptyText={emptyText}
        ariaLabel={ariaLabel}
        onPick={(next) => {
          if (!chosen.has(next)) onChange([...value, next]);
        }}
      />
    </div>
  );
}
