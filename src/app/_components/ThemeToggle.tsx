"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * Day/Night control for the colour-scheme axis only.
 *
 * It holds no state of its own: `ThemeProvider` owns the stored preference, the
 * `data-theme` attribute and the browser-chrome colour, so this control neither
 * reads the document nor writes storage. Two of these in one tree therefore
 * always agree. The visual style is a separate axis with its own control
 * (`VisualStyleToggle`); neither ever changes the other's pressed state.
 */
export function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useTheme();
  const isDay = colorScheme === "light";

  return (
    <AppearanceTogglePill
      axis="color-scheme"
      value={colorScheme}
      side={isDay ? "end" : "start"}
      pressed={isDay}
      label={isDay ? "Switch to night mode" : "Switch to day mode"}
      onToggle={toggleColorScheme}
      start={<Icon icon="lucide:moon" size={16} />}
      end={<Icon icon="lucide:sun" size={16} />}
    />
  );
}
