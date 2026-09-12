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

/**
 * The faces on this axis, in picker order. Standard first: it is the site's default
 * reading face, so the picker opens on it and a reader re-selecting it is "removing" the
 * choice, on the never-write-a-default rule every axis follows.
 *
 * Every label is a stable preview kept in the face it selects, independent of the active
 * preference: "Standard" is the authored pairing every page already paints, "Lexend" the
 * dyslexia-friendly face the retired binary toggle used, "Inter" and "Blinker" resolve
 * their self-hosted registrations, "Titillium Web" the Pro face, and "System UI" the
 * reader's own platform sans (see `src/styles/font-type.css`).
 */
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

/**
 * Face picker for the font axis: a named dropdown rather than a segmented pill, because
 * the axis is a choice among five faces and a radio row cannot hold five named options
 * in the panel's 18rem.
 *
 * State lives in `ThemeProvider` on the other controls' terms: this picker holds
 * nothing, and a publication that locks the axis (Effect Index) renders no such
 * control at all (see `AppearanceControls`), so the font storage key is never touched
 * there.
 */
export function FontPicker({ className }: { className?: string }) {
  const { fontPreference, setFontPreference } = useTheme();
  const t = useT();
  const active =
    FONT_OPTIONS.find((option) => option.value === fontPreference) ?? FONT_OPTIONS[0];

  return (
    <Select
      value={fontPreference}
      onValueChange={(value) => {
        // The axis owns its validity set; a hand-written union here would silently drift
        // from it the next time a face is added.
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
        {/* The trigger's value rides the selected face: reading the picker is already a
            preview of what each option renders as. */}
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
