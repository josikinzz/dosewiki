import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
 * real if it reaches the injected override element and the persisted envelope —
 * the same two places a color edit has to reach. Hue seeds drive derived colors
 * through the stylesheet's own cascade, so the proof that one nudge re-hues
 * whole families is asserted where the derivation actually lives — the
 * stylesheet.
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

/** The authored brand angle, as the stylesheet declares it. */
const AUTHORED_BRAND = String(parseAngle(declaredSeeds()["--h-brand"]));

const SEED_FIXTURE_ID = "hue-seed-fixture";

/**
 * Declare every hue seed at its authored angle, because jsdom does not load
 * `site-colors.css` and the revert baseline is *sampled off the live document*.
 * Without this the sampler reads an empty string for every seed and the
 * delete-on-equal rule has nothing to compare against — a green suite that proves
 * nothing about either.
 */
function installAuthoredSeeds() {
  const element = document.createElement("style");
  element.id = SEED_FIXTURE_ID;
  element.textContent = `:root{${Object.entries(declaredSeeds())
    .map(([id, value]) => `${id}:${value};`)
    .join("")}}`;
  document.head.appendChild(element);
}

function envelope(edits: Record<string, string>) {
  return JSON.stringify({
    version: 5,
    editsByLook: { [OPEN_LOOK]: { dark: edits, light: {} } },
    roleEditsByLook: {},
  });
}

async function openPanel() {
  render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);
  act(() => setThemeLabOpen(true));
  const panel = await screen.findByRole("dialog", { name: "Theme Lab" });
  await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
  return panel;
}

beforeEach(() => {
  installMockStorage();
  document.documentElement.setAttribute("data-theme", "dark");
  installAuthoredSeeds();
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
  clearThemeBaselineCache();
  setThemeLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.getElementById(SEED_FIXTURE_ID)?.remove();
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
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

    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);

    await waitFor(() => expect(overrideCss()).toContain("--h-brand:200"));
    expect(overrideCss()).toContain("--h-plum:210");
    expect(overrideCss()).toContain('html[data-theme="dark"]');
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
  });

  it("nudges a seed and persists it scoped to the active look", async () => {
    const panel = await openPanel();

    await userEvent.click(within(panel).getByRole("button", { name: /^Brand\s*\d+°$/ }));
    const slider = within(panel).getByRole("slider", { name: /^Hue/ }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "200" } });

    expect(overrideCss()).toContain("--h-brand:200");
    await waitFor(() => {
      expect(stored()).toContain('"--h-brand":"200"');
      // Edits belong to the look they were made against — that look's own map, not
      // a global overlay.
      expect(JSON.parse(stored()).editsByLook[OPEN_LOOK].dark["--h-brand"]).toBe("200");
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
    // Built from userLayerSelector rather than spelled out: the selector's
    // repeated attribute is a cascade rank that module owns, and a test that
    // hardcodes it goes stale the moment the rank moves. What this test is
    // actually about is the block's SHAPE — the dark edit heads a two-selector
    // list so the dark chrome island (the header on a light page) wears it too.
    expect(css).toContain(`${userLayerSelector("dark")}{--h-plum:40;}`);
    expect(userLayerSelector("dark")).toContain(" .theme-chrome-dark");
    // No *light* user layer: editing dark must not write light's own block.
    expect(css).not.toContain(`${userLayerSelector("light")}{`);
  });

  it("reverts a seed to the angle the page actually renders", async () => {
    // The revert baseline is sampled off the live document, so it is the angle the
    // stylesheets resolve — nothing in JS holds a second copy of it to drift from.
    const panel = await openPanel();

    const row = within(panel).getByRole("button", { name: /^Brand\s*\d+°$/ });
    expect(row).toHaveTextContent(`${AUTHORED_BRAND}°`);

    await userEvent.click(row);
    fireEvent.change(within(panel).getByRole("slider", { name: /^Hue/ }), {
      target: { value: "300" },
    });
    expect(overrideCss()).toContain("--h-brand:300");

    await userEvent.click(within(panel).getByRole("button", { name: /Reset this token/ }));

    expect(overrideCss()).not.toContain("--h-brand");
    expect(within(panel).getByRole("button", { name: /^Brand\s*\d+°$/ })).toHaveTextContent(
      `${AUTHORED_BRAND}°`,
    );
  });

  it("drops the edit when a seed is dragged back onto the angle it already renders", async () => {
    const panel = await openPanel();

    await userEvent.click(within(panel).getByRole("button", { name: /^Brand\s*\d+°$/ }));
    const slider = within(panel).getByRole("slider", { name: /^Hue/ });
    fireEvent.change(slider, { target: { value: "300" } });
    expect(overrideCss()).toContain("--h-brand:300");

    fireEvent.change(slider, { target: { value: AUTHORED_BRAND } });

    // Delete-on-equal against the sampled baseline: no redundant edit is left
    // behind for a visitor who nudged and changed their mind.
    expect(overrideCss()).not.toContain("--h-brand");
    await waitFor(() => expect(stored()).not.toContain("--h-brand"));
  });
});
