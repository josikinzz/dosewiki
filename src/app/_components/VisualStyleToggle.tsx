"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * Fun/Pro control for the visual-style axis only.
 *
 * State lives in `ThemeProvider`. A publication that locks its style renders no
 * such control (see `AppearanceControls`), and the provider never reads or writes
 * style storage under that lock.
 *
 * The two glyphs name what each style does to the page rather than a mood or a
 * dress code: a conjurer's hat for Fun's saturated, rounded, glowing treatment and
 * a mortarboard for Pro's academic register. They replaced a smiley and a necktie,
 * which described the reader instead of the page and, at the 16px these render at,
 * left the necktie reading as an unidentifiable wedge. The pill's accessible label
 * still states the action explicitly, so nothing here depends on a reader decoding
 * either symbol.
 */
export function VisualStyleToggle() {
  const { visualStyle, toggleVisualStyle } = useTheme();
  const isPro = visualStyle === "pro";

  return (
    <AppearanceTogglePill
      axis="visual-style"
      value={visualStyle}
      side={isPro ? "end" : "start"}
      pressed={isPro}
      label={isPro ? "Switch to Fun visual style" : "Switch to Pro visual style"}
      onToggle={toggleVisualStyle}
      start={<Icon icon="mingcute:magic-hat-line" size={16} />}
      end={<Icon icon="material-symbols:school-outline-rounded" size={16} />}
    />
  );
}
