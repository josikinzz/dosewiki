import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/context/ThemeContext";
import { PALETTE_ATTRIBUTE } from "@/features/theme-lab/paletteLabStorage";
import { getPaletteLabOpen, setPaletteLabOpen } from "@/features/theme-lab/paletteLabStore";
import { clearThemeBaselineCache } from "@/features/theme-lab/presetBaselines";
import { ThemeLabWorkbench } from "./ThemeLabWorkbench";

/**
 * The route's own contract, which is everything the retired footer and homepage
 * triggers used to spread across the public app: the editor opens on entry, the
 * page is held in Fun while it is open, and leaving hands both the style and the
 * shared open state back.
 */

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

/** The route mounted inside the root layout's provider, and navigated away from
 *  without taking that provider with it. */
function Harness({ onRoute, style = "fun" }: { onRoute: boolean; style?: "fun" | "pro" }) {
  return (
    <ThemeProvider initialVisualStyle={style} initialColorScheme="dark" isVisualStyleLocked={false}>
      {onRoute ? <ThemeLabWorkbench /> : <p>Somewhere else entirely</p>}
    </ThemeProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.documentElement.removeAttribute("data-visual-style");
  document.documentElement.removeAttribute("data-theme");
  document.getElementById("palette-lab-overrides")?.remove();
  clearThemeBaselineCache();
  setPaletteLabOpen(false);
});

afterEach(() => {
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById("palette-lab-overrides")?.remove();
});

describe("Palette Lab workbench", { timeout: 15_000 }, () => {
  it("opens the editor on entry", async () => {
    render(<Harness onRoute />);

    expect(await screen.findByRole("dialog", { name: "Theme Lab" })).toBeInTheDocument();
  });

  it("says what it edits, so Pro is not mistaken for something the lab owns", async () => {
    render(<Harness onRoute />);
    await screen.findByRole("dialog", { name: "Theme Lab" });

    const scope = screen.getByRole("heading", { name: "Scope" }).parentElement;
    expect(scope).not.toBeNull();
    expect(within(scope!).getByText(/palette only/)).toBeInTheDocument();
    expect(within(scope!).getByText(/official, separate visual style/)).toBeInTheDocument();
  });

  it("holds the page in Fun while the lab is open, then gives the style back", async () => {
    // Pro's presentation selectors out-specify the palette layer the lab writes,
    // so an edit made under Pro would look like it did nothing.
    const view = render(<Harness onRoute style="pro" />);
    await screen.findByRole("dialog", { name: "Theme Lab" });

    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun"),
    );

    view.rerender(<Harness onRoute={false} style="pro" />);

    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-visual-style")).toBe("pro"),
    );
    expect(getPaletteLabOpen()).toBe(false);
  });

  it("leaves a full-size action behind when the editor is closed", async () => {
    render(<Harness onRoute />);
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });

    await userEvent.click(within(panel).getByRole("button", { name: "Close Theme Lab" }));

    // Closing must not strand the tool, nor drop focus on the body.
    const reopen = await screen.findByRole("button", { name: "Open Theme Lab" });
    expect(reopen).toHaveFocus();
    expect(reopen.className, "44px minimum touch target").toContain("h-11");

    await userEvent.click(reopen);

    expect(await screen.findByRole("dialog", { name: "Theme Lab" })).toBeInTheDocument();
  });
});
