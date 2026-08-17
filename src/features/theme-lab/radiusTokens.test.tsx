import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";
import { PaletteLabLazy as PaletteLab } from "./PaletteLabLazy";
import {
  PALETTE_ATTRIBUTE,
  PALETTE_LAB_OVERRIDE_STYLE_ID,
  PALETTE_LAB_STORAGE_KEY,
} from "./paletteLabStorage";
import { setPaletteLabOpen } from "./paletteLabStore";
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
  if (seedValue !== undefined) store.set(PALETTE_LAB_STORAGE_KEY, seedValue);
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
  return document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.textContent ?? "";
}

function stored() {
  return window.localStorage.getItem(PALETTE_LAB_STORAGE_KEY) ?? "";
}

beforeEach(() => {
  installMockStorage();
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
  clearThemeBaselineCache();
  setPaletteLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
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
        version: 3,
        activeThemeRef: { kind: "preset", id: "orchid" },
        editsByPreset: { orchid: { dark: PRO_STYLE_RADIUS, light: {} } },
        customThemes: [],
        shareFormat: 1,
      }),
    );

    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);

    await waitFor(() => expect(overrideCss()).toContain("--radius:0.1875rem"));
    expect(overrideCss()).toContain("--radius-xl:0.25rem");
    expect(overrideCss()).toContain("--radius-2xl:0.25rem");
    expect(overrideCss()).toContain("--radius-3xl:0.25rem");
    expect(overrideCss()).toContain('html[data-theme="dark"]');
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
  });

  it("drags roundness to sharp and persists it scoped to the active theme", async () => {
    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);
    act(() => setPaletteLabOpen(true));
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
      // Edits belong to the theme they diverge from — the shipped preset's own
      // map, not a global overlay.
      expect(stored()).toContain('"activeThemeRef":{"kind":"preset","id":"orchid"}');
    });

    // …and dragging it back out reshapes in the other direction.
    fireEvent.change(slider, { target: { value: "1.5" } });
    expect(overrideCss()).toContain("--radius:1.5rem");
  });

  it("scopes a radius edit to the theme being edited", async () => {
    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);
    act(() => setPaletteLabOpen(true));
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });

    await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
    await userEvent.click(within(panel).getByRole("button", { name: /Panels & tiles/ }));
    fireEvent.change(within(panel).getByRole("slider", { name: /Roundness/ }), {
      target: { value: "0.25" },
    });

    const css = overrideCss();
    // The doubled attribute is the lab's user-layer selector — the specificity
    // that puts an edit level with the compiled preset blocks. The dark block
    // heads a two-selector list so the dark chrome island (the header on a
    // light page) wears the visitor's dark edits too.
    expect(css).toContain(
      'html[data-theme="dark"][data-theme],html[data-theme="light"][data-theme] .theme-chrome-dark{--radius-xl:0.25rem;}',
    );
    // No *light* user layer: editing dark must not write light's own block.
    expect(css).not.toContain('html[data-theme="light"][data-theme]{');
  });

  it("resets a radius token back to the theme's own value", async () => {
    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);
    act(() => setPaletteLabOpen(true));
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
