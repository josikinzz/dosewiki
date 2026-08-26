"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * 1/2 control for the Fun/Pro visual-style axis.
 *
 * The compact numeric labels follow the publication's style naming while the
 * hat and mortarboard remain the visual landmarks for the two underlying modes.
 */
export function VisualStyleToggle() {
  const { visualStyle, toggleVisualStyle } = useTheme();

  return (
    <AppearanceTogglePill
      axis="visual-style"
      label="Theme style"
      value={visualStyle}
      options={[
        {
          value: "fun",
          label: "1",
          icon: <Icon icon="mingcute:magic-hat-line" size={18} />,
        },
        {
          value: "pro",
          label: "2",
          icon: <Icon icon="material-symbols:school-outline-rounded" size={18} />,
        },
      ]}
      onChange={(nextStyle) => {
        if (nextStyle !== visualStyle) toggleVisualStyle();
      }}
    />
  );
}
