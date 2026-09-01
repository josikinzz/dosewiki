"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * Mode control for the colour-scheme axis: Dark, System (follow the OS
 * `prefers-color-scheme` live), Light. Renders the *preference* — a system
 * reader stays on "System" while the painted scheme follows their OS. Icons
 * are 16px and the labels ride the pill's compact segment padding so all
 * three fit the appearance popover without widening it.
 */
export function ThemeToggle() {
  const { colorSchemePreference, setColorSchemePreference } = useTheme();

  return (
    <AppearanceTogglePill
      axis="color-scheme"
      label="Mode"
      value={colorSchemePreference}
      options={[
        {
          value: "dark",
          label: "Dark",
          icon: <Icon icon="lucide:moon" size={16} />,
        },
        {
          value: "system",
          label: "System",
          icon: <Icon icon="lucide:monitor" size={16} />,
        },
        {
          value: "light",
          label: "Light",
          icon: <Icon icon="lucide:sun" size={16} />,
        },
      ]}
      onChange={setColorSchemePreference}
    />
  );
}
