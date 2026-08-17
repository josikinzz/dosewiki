import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { ThemeProvider, type ColorScheme } from "@/context/ThemeContext";

function renderPopover(colorScheme: ColorScheme) {
  document.documentElement.dataset.theme = colorScheme;
  return render(
    <ThemeProvider initialColorScheme={colorScheme}>
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent data-testid="theme-popover">Theme content</PopoverContent>
      </Popover>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Popover theme surface", () => {
  it.each(["dark", "light"] as const)(
    "uses the shared overlay surface in %s mode",
    async (colorScheme) => {
      renderPopover(colorScheme);

      await waitFor(() => {
        expect(document.documentElement.dataset.theme).toBe(colorScheme);
      });
      expect(screen.getByTestId("theme-popover")).toHaveClass("theme-overlay-surface");
    },
  );
});
