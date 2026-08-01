import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaletteLabLazy as PaletteLab } from "./PaletteLabLazy";
import { PaletteLabTrigger } from "./PaletteLabTrigger";
import { buildPaletteLabBootstrapScript } from "./paletteLabBootstrap";
import {
  PALETTE_ATTRIBUTE,
  PALETTE_LAB_OVERRIDE_STYLE_ID,
  PALETTE_LAB_STORAGE_KEY,
} from "./paletteLabStorage";
import { setPaletteLabOpen } from "./paletteLabStore";
import { clearThemeBaselineCache } from "./presetBaselines";
import { ALL_TOKEN_IDS, ESSENTIAL_IDS, PALETTE_GROUPS, getToken } from "./paletteTokens";
import {
  ANGLE_MAX,
  HUE_GROUP,
  HUE_TOKEN_IDS,
  formatAngle,
  getAngleSpec,
  normalizeAngle,
  parseAngle,
} from "./paletteTokensHues";

/**
 * Hue seeds as a theme axis, tested at the lab's one real seam:
 * *stored envelope in → applied document state out*.
 *
 * Nothing here asserts on a component's internal state. A seed edit is only
 * real if it reaches the injected override element, the persisted envelope, and
 * the pre-paint bootstrap's output — the same three places a color edit has to
 * reach. What a seed adds on top is *reach*: jsdom cannot resolve the OKLCH
 * cascade, so the proof that one nudge re-hues whole families is asserted where
 * the derivation actually lives — the stylesheet.
 */

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

const SITE_COLORS = readFileSync(resolve(process.cwd(), "src/styles/site-colors.css"), "utf8");

/** Every `--h-*` seed the stylesheet declares, with its authored angle. */
function declaredSeeds(): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /^\s*(--h-[a-z-]+):\s*([^;]+);/gm;
  let match = pattern.exec(SITE_COLORS);
  while (match) {
    result[match[1]] = match[2].trim();
    match = pattern.exec(SITE_COLORS);
  }
  return result;
}

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

function envelope(edits: Record<string, string>, presetId = "orchid") {
  return JSON.stringify({
    version: 3,
    activeThemeRef: { kind: "preset", id: presetId },
    editsByPreset: { [presetId]: { dark: edits, light: {} } },
    customThemes: [],
    shareFormat: 1,
  });
}

async function openPanel() {
  render(
    <>
      <PaletteLabTrigger />
      <PaletteLab />
    </>,
  );
  await userEvent.click(await screen.findByRole("button", { name: /Open Theme Lab/i }));
  const panel = await screen.findByRole("dialog", { name: "Theme Lab" });
  await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
  return panel;
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

describe("hue seed token group", () => {
  it("registers every hue seed as an editable angle in the shared registry", () => {
    const group = PALETTE_GROUPS.find((entry) => entry.id === HUE_GROUP.id);
    expect(group, "the hue group must be registered, not just exported").toBeTruthy();

    for (const id of HUE_TOKEN_IDS) {
      // In the registry, so the preset structural-invariant whitelist admits it
      // and the baseline sampler reads it.
      expect(ALL_TOKEN_IDS, `${id} must be a registry token`).toContain(id);
      expect(getToken(id)?.kind, `${id} must be angle-editable`).toBe("angle");
      const spec = getAngleSpec(id);
      expect(spec, `${id} needs an authored angle`).toBeTruthy();
      expect(spec!.fallback).toBeGreaterThanOrEqual(0);
      expect(spec!.fallback).toBeLessThan(ANGLE_MAX);
    }
  });

  it("offers exactly the seeds the stylesheet declares, at their authored angles", () => {
    // The registry cannot silently drift from the CSS it is a control surface
    // for: a seed added to the stylesheet fails here until it is offered.
    const declared = declaredSeeds();
    expect(Object.keys(declared).sort()).toEqual([...HUE_TOKEN_IDS].sort());
    for (const [id, value] of Object.entries(declared)) {
      expect(getAngleSpec(id)!.fallback, `${id} fallback must be the authored angle`).toBe(
        parseAngle(value),
      );
    }
  });

  it("surfaces whole-theme re-hue in the plainly-named Essentials view", () => {
    expect(ESSENTIAL_IDS).toContain("--h-brand");
  });

  it("treats angles as a circle, wrapping at both seams", () => {
    expect(normalizeAngle(400)).toBe(40);
    expect(normalizeAngle(-20)).toBe(340);
    expect(normalizeAngle(ANGLE_MAX)).toBe(0);
    expect(parseAngle("326")).toBe(326);
    expect(parseAngle("326deg")).toBe(326);
    expect(parseAngle(" 12 ")).toBe(12);
    expect(parseAngle("calc(var(--h-brand) + 10)")).toBeNull();
    expect(parseAngle("")).toBeNull();
    expect(formatAngle(361)).toBe("1");
    expect(formatAngle(-1)).toBe("359");
  });

  it("reaches whole derived families, because the derivation is in the CSS", () => {
    // jsdom cannot resolve the OKLCH cascade, so the reach of one seed is
    // asserted where it actually lives: the stylesheet's own declarations.
    // Every `--x: … var(--h-y) …` pairing, as {declared token → seeds it uses}.
    const derived = new Map<string, Set<string>>();
    const pattern = /^\s*(--[a-z0-9-]+):\s*([^;]*);/gm;
    let match = pattern.exec(SITE_COLORS);
    while (match) {
      const seeds = (match[2].match(/var\((--h-[a-z-]+)\)/g) ?? []).map((entry) =>
        entry.slice(4, -1),
      );
      if (seeds.length > 0) {
        const existing = derived.get(match[1]) ?? new Set<string>();
        for (const seed of seeds) existing.add(seed);
        derived.set(match[1], existing);
      }
      match = pattern.exec(SITE_COLORS);
    }

    const usesSeed = (seed: string) =>
      [...derived.entries()].filter(([, seeds]) => seeds.has(seed)).map(([token]) => token);

    // The brand seed is the whole-theme knob the ticket is about: one nudge,
    // dozens of tokens, spanning families rather than one corner of the page.
    const brand = usesSeed("--h-brand");
    expect(brand.length).toBeGreaterThan(50);
    for (const token of [
      "--theme-accent",
      "--theme-card-border",
      "--theme-chrome-rail-base",
      "--theme-scroll-thumb-glow",
    ]) {
      expect(brand, `${token} should follow the brand seed`).toContain(token);
    }
    // Every seed the control offers is actually consumed by the stylesheet — an
    // offered knob that moves nothing is worse than no knob.
    for (const id of HUE_TOKEN_IDS) {
      expect(usesSeed(id).length, `${id} drives nothing`).toBeGreaterThan(0);
    }
  });
});

describe("hue seed edits through the lab's seam", { timeout: 15_000 }, () => {
  it("applies a saved hue seed on load with the panel never opened", async () => {
    installMockStorage(envelope({ "--h-brand": "200", "--h-plum": "210" }));

    render(<PaletteLab />);

    await waitFor(() => expect(overrideCss()).toContain("--h-brand:200"));
    expect(overrideCss()).toContain("--h-plum:210");
    expect(overrideCss()).toContain('html[data-theme="dark"]');
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
  });

  it("restores a saved hue seed before first paint, so the palette never flashes", () => {
    installMockStorage(envelope({ "--h-brand": "120" }));

    // The bootstrap runs from <head>, before the app exists at all.
    Function(buildPaletteLabBootstrapScript())();

    expect(overrideCss()).toContain("--h-brand:120");
  });

  it("nudges a seed and persists it scoped to the active theme", async () => {
    const panel = await openPanel();

    await userEvent.click(within(panel).getByRole("button", { name: /^Brand\s*\d+°$/ }));
    const slider = within(panel).getByRole("slider", { name: /^Hue/ }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "200" } });

    expect(overrideCss()).toContain("--h-brand:200");
    await waitFor(() => {
      expect(stored()).toContain('"--h-brand":"200"');
      // Edits belong to the theme they diverge from — the shipped preset's own
      // map, not a global overlay.
      expect(stored()).toContain('"activeThemeRef":{"kind":"preset","id":"orchid"}');
    });

    // …and the wrap-around nudges carry the seam a native track stops at.
    await userEvent.click(within(panel).getByRole("button", { name: /Turn back 15 degrees/ }));
    expect(overrideCss()).toContain("--h-brand:185");
  });

  it("scopes a hue edit to the theme being edited", async () => {
    const panel = await openPanel();

    await userEvent.click(within(panel).getByRole("button", { name: /^Surfaces\s*\d+°$/ }));
    fireEvent.change(within(panel).getByRole("slider", { name: /^Hue/ }), {
      target: { value: "40" },
    });

    const css = overrideCss();
    // The doubled attribute is the lab's user-layer selector — the specificity
    // that puts an edit level with the compiled preset blocks.
    expect(css).toContain('html[data-theme="dark"][data-theme]{--h-plum:40;}');
    expect(css).not.toContain('html[data-theme="light"]');
  });

  it("reverts a seed to the active preset's own angle, not the stock one", async () => {
    // Abyss re-seats the brand hue to 215, so this is the case the isolation
    // ticket is about: reverting must land on *this* look's seed, not Orchid's.
    installMockStorage(envelope({}, "abyss"));
    const panel = await openPanel();

    const row = within(panel).getByRole("button", { name: /^Brand\s*\d+°$/ });
    expect(row).toHaveTextContent("215°");

    await userEvent.click(row);
    fireEvent.change(within(panel).getByRole("slider", { name: /^Hue/ }), {
      target: { value: "300" },
    });
    expect(overrideCss()).toContain("--h-brand:300");

    await userEvent.click(within(panel).getByRole("button", { name: /Reset this token/ }));

    expect(overrideCss()).not.toContain("--h-brand");
    // Back to the preset's own seed, which paints from the compiled block.
    expect(within(panel).getByRole("button", { name: /^Brand\s*\d+°$/ })).toHaveTextContent(
      "215°",
    );
  });

  it("drops the edit when a seed is dragged back onto the preset's own angle", async () => {
    installMockStorage(envelope({}, "abyss"));
    const panel = await openPanel();

    await userEvent.click(within(panel).getByRole("button", { name: /^Brand\s*\d+°$/ }));
    const slider = within(panel).getByRole("slider", { name: /^Hue/ });
    fireEvent.change(slider, { target: { value: "300" } });
    expect(overrideCss()).toContain("--h-brand:300");

    fireEvent.change(slider, { target: { value: "215" } });

    // Delete-on-equal against the *active* preset's value: no redundant edit is
    // left behind for a visitor who nudged and changed their mind.
    expect(overrideCss()).not.toContain("--h-brand");
    await waitFor(() => expect(stored()).not.toContain("--h-brand"));
  });
});
