"use client";

import { useTheme } from "@/context/ThemeContext";
import type { FontPreference } from "@/context/ThemeContext";
import {
  AppearanceTogglePill,
  type AppearanceToggleOption,
} from "./AppearanceTogglePill";
import { msg, useT } from "@/i18n/client";

/**
 * The two faces on this axis, in the order they sit in the picker. The labels are
 * text, not glyphs: the old icon toggle made the reader decode "Aa" versus glasses
 * and guess which state was on, where naming the two options states the choice.
 *
 * Both option labels are stable previews, each kept in the face it selects
 * independent of the active preference. "Standard" resolves the standard body face
 * for the active Fun/Pro style even while the document is wearing Lexend. "Dyslexic"
 * uses a ~2 KB Lexend subset carrying exactly that label's glyphs
 * (`--font-dyslexic-preview`, see `src/app/_fonts/dosewiki.ts`), so a reader who never
 * opens the panel never fetches even the subset.
 */
const FONT_OPTIONS: readonly [
  AppearanceToggleOption<FontPreference>,
  AppearanceToggleOption<FontPreference>,
] = [
  {
    value: "default",
    label: msg("Standard"),
    labelClassName: "theme-font-preview-standard",
  },
  {
    value: "dyslexic",
    label: msg("Dyslexic"),
    labelClassName: "theme-font-preview-dyslexic",
  },
];

/**
 * Dyslexic type control for the font axis: the same two-option segmented pill as the
 * mode and style axes, so all three share one geometry, thumb, and radio-group
 * keyboard contract (see `AppearanceTogglePill`).
 *
 * State lives in `ThemeProvider` on the other controls' terms: this picker holds
 * nothing, and a publication that locks the axis (Effect Index) renders no such
 * control at all (see `AppearanceControls`), so the font storage key is never
 * touched there.
 */
export function FontPicker() {
  const { fontPreference, setFontPreference } = useTheme();
  const t = useT();

  return (
    <AppearanceTogglePill<FontPreference>
      axis="font"
      label={t("Font")}
      value={fontPreference}
      options={FONT_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
      onChange={setFontPreference}
    />
  );
}
