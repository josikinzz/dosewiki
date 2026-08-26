"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * Dark/Light control for the colour-scheme axis only. The visible "Mode" label
 * names the setting while both endpoints state exactly what the page will use.
 */
export function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useTheme();

  return (
    <AppearanceTogglePill
      axis="color-scheme"
      label="Mode"
      value={colorScheme}
      options={[
        {
          value: "dark",
          label: "Dark",
          icon: <Icon icon="lucide:moon" size={18} />,
        },
        {
          value: "light",
          label: "Light",
          icon: <Icon icon="lucide:sun" size={18} />,
        },
      ]}
      onChange={(nextScheme) => {
        if (nextScheme !== colorScheme) toggleColorScheme();
      }}
    />
  );
}
