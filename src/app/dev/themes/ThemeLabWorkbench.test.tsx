import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/context/ThemeContext";
import { ThemeLabLazy } from "@/features/theme-lab/ThemeLabLazy";
import { getThemeLabOpen, setThemeLabOpen } from "@/features/theme-lab/themeLabStore";
import { clearThemeBaselineCache } from "@/features/theme-lab/presetBaselines";
import { ThemeLabWorkbench } from "./ThemeLabWorkbench";

/**
 * The protected workbench opens the same global drawer readers can use from
 * any page. The root-owned mount survives route navigation.
 */

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

/** The route inside the root layout's provider and global Theme Lab mount. */
function Harness({ onRoute, style = "fun" }: { onRoute: boolean; style?: "fun" | "pro" }) {
  return (
    <ThemeProvider initialVisualStyle={style} initialColorScheme="dark" isVisualStyleLocked={false}>
      {onRoute ? <ThemeLabWorkbench /> : <p>Somewhere else entirely</p>}
      <ThemeLabLazy />
    </ThemeProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-visual-style");
  document.documentElement.removeAttribute("data-theme");
  document.getElementById("theme-lab-overrides")?.remove();
  clearThemeBaselineCache();
  setThemeLabOpen(false);
});

afterEach(() => {
  document.getElementById("theme-lab-overrides")?.remove();
});

describe("Theme Lab workbench", { timeout: 15_000 }, () => {
  it("opens the editor on entry", async () => {
    render(<Harness onRoute />);

    expect(await screen.findByRole("dialog", { name: "Theme Lab" })).toBeInTheDocument();
  });

  it("says what it edits, now that Pro is authored here too", async () => {
    render(<Harness onRoute />);
    await screen.findByRole("dialog", { name: "Theme Lab" });

    const scope = screen.getByRole("heading", { name: "Scope" }).parentElement;
    expect(scope).not.toBeNull();
    expect(within(scope!).getByText(/in whichever style you are wearing/)).toBeInTheDocument();
    expect(within(scope!).getByText(/accent seeds are both editable/)).toBeInTheDocument();
    // And what it still does not own: the two files an accent actually ships from.
    expect(within(scope!).getByText(/writes\s+neither file/)).toBeInTheDocument();
  });

  it("leaves the style axis and open drawer alone across navigation", async () => {
    // The drawer and appearance provider belong to the root layout. Navigating
    // away from the protected workbench must not reset either.
    const view = render(<Harness onRoute style="pro" />);
    await screen.findByRole("dialog", { name: "Theme Lab" });

    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-visual-style")).toBe("pro"),
    );

    view.rerender(<Harness onRoute={false} style="pro" />);

    await waitFor(() => expect(getThemeLabOpen()).toBe(true));
    expect(screen.getByRole("dialog", { name: "Theme Lab" })).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-visual-style")).toBe("pro");
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
