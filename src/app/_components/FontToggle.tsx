"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * Dyslexic-friendly type control for the font axis only.
 *
 * State lives in `ThemeProvider` on the other pills' terms: this control holds
 * nothing, and a publication that locks the axis (Effect Index) renders no such
 * control at all (see `AppearanceControls`), so the font storage key is never
 * touched there.
 *
 * The glyphs name the two faces' registers rather than the reader: the type
 * specimen "Aa" for the visual style's own face, and glasses for the
 * easier-reading Lexend face. As with the other pills, the accessible label
 * states the action explicitly, so nothing depends on decoding either symbol.
 */
export function FontToggle() {
  const { fontPreference, toggleFontPreference } = useTheme();
  const isDyslexic = fontPreference === "dyslexic";

  return (
    <AppearanceTogglePill
      axis="font"
      value={fontPreference}
      side={isDyslexic ? "end" : "start"}
      pressed={isDyslexic}
      label={isDyslexic ? "Switch to standard type" : "Switch to dyslexic-friendly type"}
      onToggle={toggleFontPreference}
      start={<Icon icon="lucide:type" size={16} />}
      end={<Icon icon="lucide:glasses" size={16} />}
    />
  );
}
