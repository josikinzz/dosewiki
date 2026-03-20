"use client";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isLight}
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      className="theme-toggle-pill inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition"
    >
      <Icon
        icon={isLight ? "lucide:sun" : "lucide:moon-star"}
        size={16}
        className="text-fuchsia-300"
      />
      <span>{isLight ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
