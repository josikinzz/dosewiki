"use client";

import { useTheme } from "@/context/ThemeContext";
import type { VisualStyle } from "@/context/ThemeContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { msg, useT } from "@/i18n/client";

/**
 * The looks on this axis, in picker order. The labels name the look rather than the
 * audience - "Vivid" for the coloured, illustrated reader theme, "Clinical" for the
 * flat, dense Effect Index face. The stored values stay `fun`/`pro`: that identity is
 * baked into data-visual-style, the Pro stylesheet, and the Theme Lab token tables.
 * New looks append here - the dropdown holds any number of options, which is why the
 * axis moved off a two-segment pill.
 */
const STYLE_OPTIONS: readonly {
  value: VisualStyle;
  label: string;
}[] = [
  { value: "fun", label: msg("Vivid") },
  { value: "pro", label: msg("Clinical") },
];

/**
 * Look picker for the visual-style axis: the font picker's dropdown geometry applied
 * to Vivid/Clinical, so the colour tab's two choice rows share one shape. A
 * publication whose identity IS one style (Effect Index, locked to Pro) renders no
 * such control at all — the lock is enforced by the provider's no-op setter, and the
 * row is omitted rather than rendered inert.
 */
export function StylePicker({ className }: { className?: string }) {
  const t = useT();
  const { visualStyle, setVisualStyle } = useTheme();
  const active = STYLE_OPTIONS.find((option) => option.value === visualStyle) ?? STYLE_OPTIONS[0];

  return (
    <Select
      value={visualStyle}
      onValueChange={(value) => {
        if (value === "fun" || value === "pro") {
          setVisualStyle(value);
        }
      }}
    >
      <SelectTrigger
        aria-label={t("Style")}
        data-appearance-axis="visual-style"
        data-appearance-value={visualStyle}
        className={className}
      >
        <SelectValue asChild>
          <span>{t(active.label)}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STYLE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span>{t(option.label)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
