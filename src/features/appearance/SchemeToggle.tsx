"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { useT } from "@/i18n/client";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

export function SchemeToggle() {
  const t = useT();
  const { colorScheme, setColorScheme } = useTheme();

  return (
    <AppearanceTogglePill
      axis="color-scheme"
      label={t("Mode")}
      value={colorScheme}
      options={[
        {
          value: "dark",
          label: t("appearance.dark"),
          icon: <Icon icon="lucide:moon" size={16} />,
        },
        {
          value: "light",
          label: t("appearance.light"),
          icon: <Icon icon="lucide:sun" size={16} />,
        },
      ]}
      onChange={setColorScheme}
    />
  );
}
