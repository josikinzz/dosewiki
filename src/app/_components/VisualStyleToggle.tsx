"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * Fun and Pro use distinct, recognizable symbols while the button's changing
 * accessible label still names the action explicitly for assistive technology.
 */

/**
 * Fun/Pro control for the visual-style axis only.
 *
 * State lives in `ThemeProvider`. A publication that locks its style renders no
 * such control (see `AppearanceControls`), and the provider never reads or writes
 * style storage under that lock.
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
      start={<Icon icon="streamline:smiley-cute-remix" size={16} />}
      end={<Icon icon="hugeicons:tie" size={16} />}
    />
  );
}
