import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { ThemeProvider, useTheme, type ThemeName } from "@/context/ThemeContext";

function ThemeSetter({ theme }: { theme: ThemeName }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  return null;
}

function renderPopover(theme: ThemeName) {
  return render(
    <ThemeProvider>
      <ThemeSetter theme={theme} />
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent data-testid="theme-popover">Theme content</PopoverContent>
      </Popover>
    </ThemeProvider>,
  );
}

describe("Popover theme surface", () => {
  it.each(["dark", "light"] as const)("uses the shared overlay surface in %s mode", async (theme) => {
    renderPopover(theme);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe(theme);
    });

    expect(screen.getByTestId("theme-popover")).toHaveClass("theme-overlay-surface");
  });
});
