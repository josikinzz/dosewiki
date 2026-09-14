import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type * as SiteFlavorModule from "@/config/siteFlavor";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";
import { ACCENT_HUE_PROPERTY, SURFACE_HUE_PROPERTY } from "@/theme/appearanceChroma";
import { ThemeLabLazy as ThemeLab } from "./ThemeLabLazy";
import { THEME_LAB_OVERRIDE_STYLE_ID } from "./themeLabStorage";
import { setThemeLabOpen } from "./themeLabStore";
import { clearThemeBaselineCache } from "./presetBaselines";
vi.mock("@/config/siteFlavor", async (importOriginal) => {
  const actual = await importOriginal<typeof SiteFlavorModule>();
  return {
    ...actual,
    SITE_FLAVOR_CONFIG: actual.SITE_FLAVOR_CONFIGS.dosewiki,
    isEffectIndex: (config = actual.SITE_FLAVOR_CONFIGS.dosewiki) =>
      actual.isEffectIndex(config),
  };
});


/**
 * The drawer, through the suite's usual seam: open it through the global store, drive it
 * with real user events, and assert what a reader can observe — which controls it offers,
 * what the document does when they are used, what the injected layer carries, and where
 * focus ends up.
 *
 * The load-bearing claim is that the lab has no appearance system of its own. Its top
 * section is the same `AppearanceAxes` the header cog renders, so dragging a hue or
 * saturation slider here has to move the site's own root properties — a lab that
 * painted its own private copy would pass a rendering assertion and still leave the
 * reader's controls inert.
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

/** The layer the lab injects — the only place a token edit becomes visible to the page. */
function injectedCss(): string {
  return document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.textContent ?? "";
}

beforeEach(() => {
  installMockStorage();
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.style.removeProperty(SURFACE_HUE_PROPERTY);
  document.documentElement.style.removeProperty(ACCENT_HUE_PROPERTY);
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
  clearThemeBaselineCache();
  setThemeLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(SURFACE_HUE_PROPERTY);
  document.documentElement.style.removeProperty(ACCENT_HUE_PROPERTY);
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
});

async function openPanel() {
  // The route opens the lab and hands it the element focus returns to; the
  // second button stands in for that route-local action.
  render(
    <>
      <button type="button">Elsewhere on the page</button>
      <button type="button">Open Theme Lab</button>
      <AppearanceTestProvider>
        <ThemeLab />
      </AppearanceTestProvider>
    </>,
  );
  act(() => setThemeLabOpen(true, screen.getByRole("button", { name: "Open Theme Lab" })));
  return screen.findByRole("dialog", { name: "Theme Lab" });
}

/** Bind the editor to one essential token and give it a value. */
async function editPageBackground(panel: HTMLElement, hex: string) {
  await userEvent.click(within(panel).getByRole("button", { name: /Page background/ }));
  fireEvent.change(within(panel).getByRole("textbox", { name: /Hex/ }), {
    target: { value: hex },
  });
}

describe("Theme Lab drawer", { timeout: 15_000 }, () => {
  it("opens on the site's own appearance axes", async () => {
    const panel = await openPanel();

    // The three binary pills publish their axis to the DOM; style, scheme, and font.
    expect(panel.querySelectorAll("[data-appearance-axis]")).toHaveLength(3);

    // Both colour axes arrive as the site's own hue and saturation sliders.
    expect(within(panel).getByRole("slider", { name: "Surface hue" })).toBeInTheDocument();
    expect(within(panel).getByRole("slider", { name: "Surface saturation" })).toBeInTheDocument();
    expect(within(panel).getByRole("slider", { name: "Accent hue" })).toBeInTheDocument();
    expect(within(panel).getByRole("slider", { name: "Accent saturation" })).toBeInTheDocument();
  });

  it("drives the site's real hue axes, not a private copy of them", async () => {
    const panel = await openPanel();
    const root = document.documentElement;

    fireEvent.change(within(panel).getByRole("slider", { name: "Accent hue" }), {
      target: { value: "120" },
    });
    await waitFor(() => expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("120"));

    fireEvent.change(within(panel).getByRole("slider", { name: "Surface hue" }), {
      target: { value: "40" },
    });
    await waitFor(() => expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY)).toBe("40"));

    // Choosing a hue is not an edit: the panel still reports a clean look.
    expect(within(panel).getByText("No changes")).toBeInTheDocument();
  });

  it("keeps the editor collapsed until a swatch is picked", async () => {
    const panel = await openPanel();

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

  it("writes a token edit into the layer the page renders", async () => {
    const panel = await openPanel();
    expect(injectedCss()).not.toContain("--theme-body-bg");

    await editPageBackground(panel, "#123456");

    await waitFor(() => expect(injectedCss()).toContain("--theme-body-bg:#123456"));
    expect(within(panel).getByRole("button", { name: /1 changed/ })).toBeInTheDocument();
  });

  it("keeps an edit painting across a hue move, because hue is appearance rather than navigation", async () => {
    const panel = await openPanel();
    await editPageBackground(panel, "#123456");
    await waitFor(() => expect(injectedCss()).toContain("--theme-body-bg:#123456"));

    // A hue move is a continuous position over the same palette, not a different
    // look: the edit is a literal colour that out-ranks the rotated tokens
    // wherever the slider sits, so it follows the reader rather than parking.
    // (Style flips *are* navigation; the runtime suite pins that parking.)
    fireEvent.change(within(panel).getByRole("slider", { name: "Accent hue" }), {
      target: { value: "200" },
    });

    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("200"),
    );
    expect(injectedCss()).toContain("--theme-body-bg:#123456");
    expect(within(panel).getByRole("button", { name: /1 changed/ })).toBeInTheDocument();
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
    expect(within(panel).queryByRole("img", { name: "changed" })).not.toBeInTheDocument();

    await editPageBackground(panel, "#123456");

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
    await editPageBackground(panel, "#123456");

    const row = within(panel).getAllByRole("img", { name: "changed" })[0].closest("button");
    expect(row).not.toBeNull();
    expect(row?.className).toContain("[&_svg]:size-[10px]");
    expect(row?.className).not.toContain("[&_svg]:size-4");
  });
});
