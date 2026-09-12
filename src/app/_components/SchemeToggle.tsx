"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { useT } from "@/i18n/client";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * Mode control for the colour-scheme axis, as the reader panel offers it: Dark or
 * Light. It renders the *resolved* scheme — a reader whose stored preference is
 * "system" (an era when the panel offered it) sees the scheme they are looking at
 * checked, and touching either segment pins that scheme explicitly on the old
 * two-option flip contract.
 *
 * The Theme Lab drawer keeps the three-way Dark/System/Light pill (ThemeToggle), so
 * a dev can still hand the axis back to the OS.
 */
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
          label: t("Dark"),
          icon: <Icon icon="lucide:moon" size={16} />,
        },
        {
          value: "light",
          label: t("Light"),
          icon: <Icon icon="lucide:sun" size={16} />,
        },
      ]}
      onChange={setColorScheme}
    />
  );
}
