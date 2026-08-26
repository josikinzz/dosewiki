"use client";

import { useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { useTheme } from "@/context/ThemeContext";
import type { FontPreference } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

/**
 * The two faces on this axis, in the order they sit in the picker. The labels are
 * text, not glyphs: the old icon toggle made the reader decode "Aa" versus glasses
 * and guess which state was on, where naming the two options states the choice.
 */
const FONT_OPTIONS: readonly {
  value: FontPreference;
  label: string;
  /** Keep each sample in the face it selects, independent of the active preference. */
  previewClassName: string;
}[] = [
  {
    value: "default",
    label: "Standard",
    previewClassName: "theme-font-preview-standard",
  },
  {
    value: "dyslexic",
    label: "Dyslexic",
    previewClassName: "theme-font-preview-dyslexic",
  },
];

/**
 * Dyslexic type control for the font axis: a two-option segmented toggle.
 *
 * State lives in `ThemeProvider` on the other controls' terms: this picker holds
 * nothing, and a publication that locks the axis (Effect Index) renders no such
 * control at all (see `AppearanceControls`), so the font storage key is never
 * touched there.
 *
 * Radio semantics keep the two mutually exclusive named options and checked state clear.
 * Arrows move and select on the radio-group pattern; pointer/Enter/Space activation on
 * either half flips to the other value, and only the checked option sits in the tab order.
 *
 * Both option labels are stable previews. "Standard" resolves the standard body face for
 * the active Fun/Pro style even while the document is wearing Lexend. "Dyslexic"
 * uses a ~2 KB Lexend subset carrying exactly that label's glyphs
 * (`--font-dyslexic-preview`, see `src/app/_fonts/dosewiki.ts`), so a reader who never
 * opens the panel never fetches even the subset.
 */
export function FontPicker() {
  const { fontPreference, setFontPreference } = useTheme();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = useId();

  const select = (value: FontPreference, moveFocus: boolean) => {
    setFontPreference(value);
    if (moveFocus) {
      const index = FONT_OPTIONS.findIndex((option) => option.value === value);
      optionRefs.current[index]?.focus();
    }
  };

  const activate = (value: FontPreference) => {
    const index = FONT_OPTIONS.findIndex((option) => option.value === value);
    const nextValue =
      value === fontPreference
        ? FONT_OPTIONS[(index + 1) % FONT_OPTIONS.length]!.value
        : value;
    select(nextValue, false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const index = FONT_OPTIONS.findIndex(
      (option) => option.value === fontPreference,
    );
    let next = -1;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % FONT_OPTIONS.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + FONT_OPTIONS.length) % FONT_OPTIONS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = FONT_OPTIONS.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    select(FONT_OPTIONS[next]!.value, true);
  };

  return (
    <div className="theme-appearance-field grid grid-cols-[minmax(0,5.75rem)_minmax(0,1fr)] items-center gap-3 max-[340px]:grid-cols-1 max-[340px]:gap-1.5">
      <span
        id={labelId}
        className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-dose-text-muted"
      >
        Font
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        data-appearance-axis="font"
        data-appearance-value={fontPreference}
        className="theme-toggle-pill grid h-11 min-w-0 grid-cols-2 items-center gap-0.5 rounded-full p-1 transition-[border-color,background-color] duration-300 motion-reduce:transition-none [@media(pointer:coarse)]:h-13"
      >
        {FONT_OPTIONS.map((option, index) => {
          const checked = fontPreference === option.value;

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
              onClick={() => activate(option.value)}
              onKeyDown={handleKeyDown}
              className={cn(
                "theme-focus-ring inline-flex h-9 min-w-0 items-center justify-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap transition-[background-color,color,border-color,box-shadow] duration-300 motion-reduce:transition-none [@media(pointer:coarse)]:h-11",
                checked ? "theme-toggle-thumb" : "theme-toggle-icon-muted",
              )}
            >
              <span className={option.previewClassName}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
