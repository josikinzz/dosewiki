"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceTogglePill } from "./AppearanceTogglePill";
import { useT } from "@/i18n/client";

export function ThemeToggle() {
  const { colorSchemePreference, setColorSchemePreference } = useTheme();
  const t = useT();

  return (
    <AppearanceTogglePill
      axis="color-scheme"
      label={t("Mode")}
      value={colorSchemePreference}
      options={[
        {
          value: "dark",
          label: t("appearance.dark"),
          icon: <Icon icon="lucide:moon" size={16} />,
        },
        {
          value: "system",
          label: t("System"),
          icon: <Icon icon="lucide:monitor" size={16} />,
        },
        {
          value: "light",
          label: t("appearance.light"),
          icon: <Icon icon="lucide:sun" size={16} />,
        },
      ]}
      onChange={setColorSchemePreference}
    />
  );
}
