"use client";

import {
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/** The appearance axis a segmented picker owns. Mirrored to the DOM for tests and skins. */
type AppearanceAxis = "color-scheme" | "visual-style";

export type AppearanceToggleOption<Value extends string> = {
  value: Value;
  label: string;
  icon: ReactNode;
};

interface AppearanceTogglePillProps<Value extends string> {
  axis: AppearanceAxis;
  /** Visible category label, e.g. "Style" or "Mode". */
  label: string;
  value: Value;
  options: readonly [AppearanceToggleOption<Value>, AppearanceToggleOption<Value>];
  onChange: (value: Value) => void;
}

/**
 * A named two-option appearance picker.
 *
 * Each choice is exposed as a radio so the visible labels, checked state, screen-reader
 * output, and arrow-key behavior stay aligned. Pointer/Enter/Space activation keeps the
 * toggle contract: pressing either half always flips to the other value, including when
 * the pressed half is already checked. The moving seat preserves the compact control
 * language shared with the font picker without asking a reader to decode icons alone.
 */
export function AppearanceTogglePill<Value extends string>({
  axis,
  label,
  value,
  options,
  onChange,
}: AppearanceTogglePillProps<Value>) {
  const labelId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const select = (index: number, moveFocus: boolean) => {
    const option = options[index];
    if (option == null) return;
    if (option.value !== value) onChange(option.value);
    if (moveFocus) optionRefs.current[index]?.focus();
  };

  const activate = (index: number) => {
    const option = options[index];
    if (option == null) return;
    const nextIndex = option.value === value ? (index + 1) % options.length : index;
    select(nextIndex, false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    let next = -1;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (selectedIndex + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (selectedIndex - 1 + options.length) % options.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = options.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    select(next, true);
  };

  return (
    <div className="theme-appearance-field grid grid-cols-[minmax(0,5.75rem)_minmax(0,1fr)] items-center gap-3 max-[340px]:grid-cols-1 max-[340px]:gap-1.5">
      <span
        id={labelId}
        className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-dose-text-muted"
      >
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        data-appearance-axis={axis}
        data-appearance-value={value}
        className="theme-toggle-pill relative grid h-11 min-w-0 grid-cols-2 items-center rounded-full px-1 transition-[border-color,background-color] duration-300 motion-reduce:transition-none [@media(pointer:coarse)]:h-13"
      >
        <span
          aria-hidden="true"
          className={cn(
            "theme-toggle-thumb pointer-events-none absolute inset-y-1 left-1 right-1/2 rounded-full border transition-transform duration-300 motion-reduce:transition-none",
            selectedIndex === 0 ? "translate-x-0" : "translate-x-full",
          )}
        />
        {options.map((option, index) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => activate(index)}
              onKeyDown={handleKeyDown}
              className={cn(
                "theme-focus-ring relative z-10 inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-semibold whitespace-nowrap transition-colors duration-300 motion-reduce:transition-none [@media(pointer:coarse)]:h-11",
                checked ? "theme-toggle-icon-accent" : "theme-toggle-icon-muted",
              )}
            >
              <span aria-hidden="true" className="shrink-0">
                {option.icon}
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
