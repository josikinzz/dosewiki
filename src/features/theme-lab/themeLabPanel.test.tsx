import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";
import { PaletteLabLazy as PaletteLab } from "./PaletteLabLazy";
import { PALETTE_ATTRIBUTE } from "./paletteLabStorage";
import { setPaletteLabOpen } from "./paletteLabStore";
import { clearThemeBaselineCache } from "./presetBaselines";

/**
 * The gallery-first panel, through the suite's usual seam: open it through the
 * global store, drive it with real user events, and assert what a reader can
 * observe — which view is showing, whether an editor exists at all, where focus
 * is, and what Escape does.
 *
 * These replace the behaviors the redesign retired: the panel no longer
 * force-selects a token on open (so the editor is no longer always expanded),
 * and Escape is no longer a window-level handler that fired site-wide.
 */

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

function installMockStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
}

beforeEach(() => {
  installMockStorage();
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById("palette-lab-overrides")?.remove();
  clearThemeBaselineCache();
  setPaletteLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById("palette-lab-overrides")?.remove();
});

async function openPanel() {
  // The route opens the lab and hands it the element focus returns to; the
  // second button stands in for that route-local action.
  render(
    <>
      <button type="button">Elsewhere on the page</button>
      <button type="button">Open Theme Lab</button>
      <AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>
    </>,
  );
  act(() => setPaletteLabOpen(true, screen.getByRole("button", { name: "Open Theme Lab" })));
  return screen.findByRole("dialog", { name: "Theme Lab" });
}

describe("Theme Lab panel", { timeout: 15_000 }, () => {
  it("opens on the theme gallery with nothing selected and no editor at all", async () => {
    const panel = await openPanel();

    expect(within(panel).getByRole("button", { name: "Themes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The gallery itself: complete looks, one tap to wear.
    expect(within(panel).getByRole("button", { name: /^Orchid/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /^Abyss/ })).toBeInTheDocument();

    // No token was auto-selected, so there is no color control taking up the
    // panel — not even the collapsed hint, which belongs to the catalog views.
    expect(within(panel).queryByRole("slider", { name: "Hue" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("textbox", { name: /Hex/ })).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Pick a swatch below/)).not.toBeInTheDocument();
  });

  it("keeps the editor collapsed in a catalog view until a swatch is picked", async () => {
    const panel = await openPanel();

    await userEvent.click(within(panel).getByRole("button", { name: /Essentials/ }));
    expect(within(panel).getByText(/Pick a swatch below/)).toBeInTheDocument();
    expect(within(panel).queryByRole("slider", { name: "Hue" })).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: /Page background/ }));

    // The compact control: a saturation/value rectangle plus a hue slider.
    expect(within(panel).getByRole("slider", { name: "Hue" })).toBeInTheDocument();
    expect(
      within(panel).getByRole("slider", { name: "Saturation and brightness" }),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/Pick a swatch below/)).not.toBeInTheDocument();
  });

  it("moves focus into the panel when it opens", async () => {
    const panel = await openPanel();
    expect(panel).toHaveFocus();
  });

  it("closes on an Escape pressed inside the panel and ignores one pressed outside", async () => {
    const panel = await openPanel();

    // Escape somewhere else on the page belongs to that part of the page.
    await userEvent.click(screen.getByRole("button", { name: "Elsewhere on the page" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Theme Lab" })).toBeInTheDocument();

    // Escape inside the panel closes it and hands focus back to the opener.
    within(panel).getByRole("button", { name: "Close Theme Lab" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Theme Lab/i })).toHaveFocus();
  });

  it("marks a changed row with a named glyph rather than color alone", async () => {
    const panel = await openPanel();
    await userEvent.click(within(panel).getByRole("button", { name: /Essentials/ }));
    expect(within(panel).queryByRole("img", { name: "changed" })).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: /Page background/ }));
    fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#123456" },
    });

    expect(within(panel).getAllByRole("img", { name: "changed" }).length).toBeGreaterThan(0);
  });

  /**
   * The kit's Button base ships `[&_svg]:size-4`, a descendant *declaration*
   * that beats the width/height attributes `Icon` sets. Left alone it inflates
   * the changed mark's 10px pencil to 16px inside its 18px ring — a pencil
   * jammed edge to edge instead of a small mark.
   */
  it("keeps the changed mark's glyph at the size the row authors", async () => {
    const panel = await openPanel();
    await userEvent.click(within(panel).getByRole("button", { name: /Essentials/ }));
    await userEvent.click(within(panel).getByRole("button", { name: /Page background/ }));
    fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#123456" },
    });

    const row = within(panel).getAllByRole("img", { name: "changed" })[0].closest("button");
    expect(row).not.toBeNull();
    expect(row?.className).toContain("[&_svg]:size-[10px]");
    expect(row?.className).not.toContain("[&_svg]:size-4");
  });

  /**
   * `pillActive` names a border colour but no width, and preflight resets every
   * element to `border: 0 solid`. Without an explicit width the selected card
   * would drop to a 0px border, shrink 2px in both axes, and reflow the gallery
   * the moment a theme is picked.
   */
  it("keeps preset cards the same size selected or not", async () => {
    const panel = await openPanel();
    await userEvent.click(within(panel).getByRole("button", { name: /^Orchid/ }));

    const selected = within(panel).getByRole("button", { name: /^Orchid/ });
    const unselected = within(panel).getByRole("button", { name: /^Abyss/ });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(unselected).toHaveAttribute("aria-pressed", "false");

    for (const card of [selected, unselected]) {
      expect(card.classList.contains("border")).toBe(true);
    }
  });
});
