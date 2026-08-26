"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * Vivid/Clinical control for the visual-style axis.
 *
 * Both halves name the look rather than the audience: "Vivid" for the colored,
 * illustrated reader theme and "Clinical" for the flat, dense Effect Index face.
 * The stored values stay `fun`/`pro` — that identity is baked into
 * `data-visual-style`, the Pro stylesheet, and the Theme Lab token tables.
 */
export function VisualStyleToggle() {
  const { visualStyle, toggleVisualStyle } = useTheme();

  return (
    <AppearanceTogglePill
      axis="visual-style"
      label="Style"
      value={visualStyle}
      options={[
        {
          value: "fun",
          label: "Vivid",
          icon: <Icon icon="mingcute:magic-hat-line" size={18} />,
        },
        {
          value: "pro",
          label: "Clinical",
          icon: <Icon icon="ph:flask-bold" size={18} />,
        },
      ]}
      onChange={(nextStyle) => {
        if (nextStyle !== visualStyle) toggleVisualStyle();
      }}
    />
  );
}
