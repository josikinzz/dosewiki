"use client";

import { useTheme } from "@/context/ThemeContext";
import type { FontPreference } from "@/context/ThemeContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { msg, useT } from "@/i18n/client";
import { isFontPreference } from "@/theme";

const FONT_OPTIONS: readonly {
  value: FontPreference;
  label: string;
  labelClassName: string;
}[] = [
  {
    value: "standard",
    label: msg("Standard"),
    labelClassName: "theme-font-preview-standard",
  },
  {
    value: "lexend",
    label: "Lexend",
    labelClassName: "theme-font-preview-lexend",
  },
  {
    value: "inter",
    label: "Inter",
    labelClassName: "theme-font-preview-inter",
  },
  {
    value: "blinker",
    label: "Blinker",
    labelClassName: "theme-font-preview-blinker",
  },
  {
    value: "titillium",
    label: "Titillium Web",
    labelClassName: "theme-font-preview-titillium",
  },
  {
    value: "system",
    label: "System UI",
    labelClassName: "theme-font-preview-system",
  },
];

export function FontPicker({ className }: { className?: string }) {
  const { fontPreference, setFontPreference } = useTheme();
  const t = useT();
  const active =
    FONT_OPTIONS.find((option) => option.value === fontPreference) ?? FONT_OPTIONS[0];

  return (
    <Select
      value={fontPreference}
      onValueChange={(value) => {
        if (isFontPreference(value)) {
          setFontPreference(value);
        }
      }}
    >
      <SelectTrigger
        aria-label={t("Font")}
        data-appearance-axis="font"
        data-appearance-value={fontPreference}
        className={className}
      >
        <SelectValue asChild>
          <span className={active.labelClassName}>{t(active.label)}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {FONT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className={option.labelClassName}>{t(option.label)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
