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

const STYLE_OPTIONS: readonly {
  value: VisualStyle;
  label: string;
}[] = [
  { value: "fun", label: msg("Vivid") },
  { value: "pro", label: msg("Clinical") },
];

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
