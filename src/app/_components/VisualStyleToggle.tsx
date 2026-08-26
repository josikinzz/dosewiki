"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceTogglePill } from "./AppearanceTogglePill";

/**
 * Fun/Pro control for the visual-style axis.
 *
 * The two faces are named plainly — "Fun" and "Pro" — so a reader maps the
 * option to the published style without decoding an index; the hat and
 * mortarboard remain the visual landmarks for the two underlying modes.
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
          label: "Fun",
          icon: <Icon icon="mingcute:magic-hat-line" size={18} />,
        },
        {
          value: "pro",
          label: "Pro",
          icon: (
            <Icon icon="material-symbols:school-outline-rounded" size={18} />
          ),
        },
      ]}
      onChange={(nextStyle) => {
        if (nextStyle !== visualStyle) toggleVisualStyle();
      }}
    />
  );
}
