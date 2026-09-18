import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";
import { ThemeLabLazy as ThemeLab } from "./ThemeLabLazy";
import {
  THEME_LAB_OVERRIDE_STYLE_ID,
  THEME_LAB_STORAGE_KEY,
  userLayerSelector,
} from "./themeLabStorage";
import { DEFAULT_LOOK, lookKey } from "./themeLabLook";
import { setThemeLabOpen } from "./themeLabStore";
import { clearThemeBaselineCache } from "./presetBaselines";
import { ALL_TOKEN_IDS, PALETTE_GROUPS, ESSENTIAL_IDS, getToken } from "./paletteTokens";
import {
  PRO_STYLE_RADIUS,
  RADIUS_GROUP,
  RADIUS_TOKEN_IDS,
  formatRem,
  getLengthSpec,
  parseRem,
} from "./paletteTokensRadius";

/**
 * Corner radius as a theme axis, tested at the lab's one real seam:
 * *stored envelope in → applied document state out*.
 *
 * Nothing here asserts on a component's internal state. A radius edit is only
 * real if it reaches the injected override element and the persisted envelope —
 * the same two places a color edit has to reach.
 */

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

function installMockStorage(seedValue?: string) {
  const store = new Map<string, string>();
  if (seedValue !== undefined) store.set(THEME_LAB_STORAGE_KEY, seedValue);
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

function overrideCss() {
  return document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.textContent ?? "";
}

function stored() {
  return window.localStorage.getItem(THEME_LAB_STORAGE_KEY) ?? "";
}

/** The look `AppearanceTestProvider` opens on: the style pinned to Fun. Edits are
 *  keyed by look, so a seeded envelope has to name the look the panel will
 *  actually be editing. */
const OPEN_LOOK = lookKey(DEFAULT_LOOK);

beforeEach(() => {
  installMockStorage();
  document.documentElement.setAttribute("data-theme", "dark");
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
  clearThemeBaselineCache();
  setThemeLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
});

describe("radius token group", () => {
  it("registers every radius token as an editable length in the shared registry", () => {
    const group = PALETTE_GROUPS.find((entry) => entry.id === RADIUS_GROUP.id);
    expect(group, "the radius group must be registered, not just exported").toBeTruthy();

    for (const id of RADIUS_TOKEN_IDS) {
      // In the registry, so the preset structural-invariant whitelist admits it
      // and the baseline sampler reads it.
      expect(ALL_TOKEN_IDS, `${id} must be a registry token`).toContain(id);
      expect(getToken(id)?.kind, `${id} must be slider-editable`).toBe("length");
      const spec = getLengthSpec(id);
      expect(spec, `${id} needs slider bounds`).toBeTruthy();
      // Fully sharp has to be reachable, or "from fully rounded to sharp" is a
      // range the visitor cannot actually drag through.
      expect(spec!.min).toBe(0);
      expect(spec!.max).toBeGreaterThan(spec!.min);
      expect(parseRem(spec!.fallback), `${id} fallback must be a length`).not.toBeNull();
    }
  });

  it("surfaces roundness in the plainly-named Essentials view, not only the full catalog", () => {
    expect(ESSENTIAL_IDS).toContain("--radius");
  });

  it("leaves pills and circles out of the sweep", () => {
    // `rounded-full` compiles to a literal, not a variable, so nothing in this
    // group can reach an avatar, dot, or pill — the exclusion is structural.
    for (const id of RADIUS_TOKEN_IDS) {
      expect(id.startsWith("--radius")).toBe(true);
      expect(id).not.toContain("full");
    }
  });

  it("reads and writes lengths without drifting through float noise", () => {
    expect(parseRem("1rem")).toBe(1);
    expect(parseRem("16px")).toBe(1);
    expect(parseRem("0")).toBe(0);
    expect(parseRem("calc(var(--radius) - 2px)")).toBeNull();
    expect(parseRem("")).toBeNull();
    expect(formatRem(0.1875)).toBe("0.1875rem");
    expect(formatRem(0)).toBe("0rem");
  });

  it("can express the Pro style's squared-off geometry with no component change", () => {
    // The self-check from the investigation: the Pro skin squares the site by
    // redefining the same utilities these tokens sit behind. If its values are
    // expressible here, the control is wired to the real mechanism.
    expect(Object.keys(PRO_STYLE_RADIUS).sort()).toEqual([...RADIUS_TOKEN_IDS].sort());
    for (const [id, value] of Object.entries(PRO_STYLE_RADIUS)) {
      const rem = parseRem(value);
      expect(rem, `${id} must be a plain length`).not.toBeNull();
      const spec = getLengthSpec(id)!;
      expect(rem!).toBeGreaterThanOrEqual(spec.min);
      expect(rem!).toBeLessThanOrEqual(spec.max);
    }
  });
});

describe("radius edits through the lab's seam", { timeout: 15_000 }, () => {
  it("applies a saved radius on load with the panel never opened", async () => {
    installMockStorage(
      JSON.stringify({
        version: 5,
        editsByLook: { [OPEN_LOOK]: { dark: PRO_STYLE_RADIUS, light: {} } },
        roleEditsByLook: {},
      }),
    );

    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);

    await waitFor(() => expect(overrideCss()).toContain("--radius:0.1875rem"));
    expect(overrideCss()).toContain("--radius-xl:0.25rem");
    expect(overrideCss()).toContain("--radius-2xl:0.25rem");
    expect(overrideCss()).toContain("--radius-3xl:0.25rem");
    expect(overrideCss()).toContain('html[data-theme="dark"]');
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
  });

  it("drags roundness to sharp and persists it scoped to the active look", async () => {
    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);
    act(() => setThemeLabOpen(true));
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });

    await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
    await userEvent.click(
      within(panel).getByRole("button", { name: /Cards, buttons & fields/ }),
    );

    const slider = within(panel).getByRole("slider", { name: /Roundness/ }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0" } });

    expect(overrideCss()).toContain("--radius:0rem");
    await waitFor(() => {
      expect(stored()).toContain('"--radius":"0rem"');
      // Edits belong to the look they were made against — that look's own map, not
      // a global overlay.
      expect(JSON.parse(stored()).editsByLook[OPEN_LOOK].dark["--radius"]).toBe("0rem");
    });

    // …and dragging it back out reshapes in the other direction.
    fireEvent.change(slider, { target: { value: "1.5" } });
    expect(overrideCss()).toContain("--radius:1.5rem");
  });

  it("scopes a radius edit to the theme being edited", async () => {
    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);
    act(() => setThemeLabOpen(true));
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });

    await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
    await userEvent.click(within(panel).getByRole("button", { name: /Panels & tiles/ }));
    fireEvent.change(within(panel).getByRole("slider", { name: /Roundness/ }), {
      target: { value: "0.25" },
    });

    const css = overrideCss();
    // Built from userLayerSelector rather than spelled out: the selector's
    // repeated attribute is a cascade rank that module owns, and a test that
    // hardcodes it goes stale the moment the rank moves. What this test is
    // actually about is the block's SHAPE — the dark edit heads a two-selector
    // list so the dark chrome island (the header on a light page) wears it too.
    expect(css).toContain(`${userLayerSelector("dark")}{--radius-xl:0.25rem;}`);
    expect(userLayerSelector("dark")).toContain(" .theme-chrome-dark");
    // No *light* user layer: editing dark must not write light's own block.
    expect(css).not.toContain(`${userLayerSelector("light")}{`);
  });

  it("resets a radius token back to the theme's own value", async () => {
    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);
    act(() => setThemeLabOpen(true));
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });

    await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
    await userEvent.click(
      within(panel).getByRole("button", { name: /Cards, buttons & fields/ }),
    );
    fireEvent.change(within(panel).getByRole("slider", { name: /Roundness/ }), {
      target: { value: "0" },
    });
    expect(overrideCss()).toContain("--radius:0rem");

    await userEvent.click(within(panel).getByRole("button", { name: /Reset this token/ }));

    expect(overrideCss()).not.toContain("--radius:0rem");
  });
});
