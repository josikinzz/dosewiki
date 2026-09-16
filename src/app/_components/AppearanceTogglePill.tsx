"use client";

import {
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/** The appearance axis a segmented picker owns. Mirrored to the DOM for tests and skins. */
type AppearanceAxis = "color-scheme" | "visual-style" | "font";

type AppearanceToggleOption<Value extends string> = {
  value: Value;
  label: string;
  icon?: ReactNode;
  /** Extra class on the label span, e.g. a font-face preview for the font axis. */
  labelClassName?: string;
};

interface AppearanceTogglePillProps<Value extends string> {
  axis: AppearanceAxis;
  /** The axis's accessible name, e.g. "Style" or "Mode". */
  label: string;
  value: Value;
  /** Two or more options; every segment gets an equal share of the pill. */
  options: readonly AppearanceToggleOption<Value>[];
  onChange: (value: Value) => void;
}

/**
 * A named segmented appearance picker.
 *
 * Each choice is exposed as a radio so the visible labels, checked state, screen-reader
 * output, and arrow-key behavior stay aligned. With exactly two options, pointer/Enter/
 * Space activation keeps the historical toggle contract: pressing either half always
 * flips to the other value, including when the pressed half is already checked. With
 * three or more, re-pressing the checked segment is a no-op — cycling through the ring
 * from an already-made choice would change the theme the reader just confirmed.
 *
 * The axis name is the group's accessible name, not a visible gutter label: named
 * options ("Dark"/"System"/"Light", "Vivid"/"Clinical") plus their icons already state
 * the choice, spending a share of the panel's width restating the category only
 * narrowed the pill that has to hold the labels.
 */
export function AppearanceTogglePill<Value extends string>({
  axis,
  label,
  value,
  options,
  onChange,
}: AppearanceTogglePillProps<Value>) {
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
    const nextIndex =
      option.value === value && options.length === 2 ? (index + 1) % options.length : index;
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
    <div
      role="radiogroup"
      aria-label={label}
      data-appearance-axis={axis}
      data-appearance-value={value}
      className="theme-toggle-pill relative grid h-11 min-w-0 items-center rounded-full px-1 transition-[border-color,background-color] duration-[180ms] motion-reduce:transition-none [@media(pointer:coarse)]:h-13"
      style={
        {
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        } as CSSProperties
      }
    >
      <span
        aria-hidden="true"
        className="theme-toggle-thumb pointer-events-none absolute inset-y-1 left-1 rounded-full border transition-transform duration-[240ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${selectedIndex * 100}%)`,
        }}
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
              "theme-focus-ring relative z-10 inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-full px-1 text-xs font-semibold whitespace-nowrap transition-colors duration-[180ms] motion-reduce:transition-none [@media(pointer:coarse)]:h-11",
              checked ? "theme-toggle-icon-accent" : "theme-toggle-icon-muted",
            )}
          >
            {option.icon != null ? (
              <span aria-hidden="true" className="shrink-0">
                {option.icon}
              </span>
            ) : null}
            <span className={option.labelClassName}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
