import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";
import { PRO_ACCENT_SEED_NAMES } from "@/theme/accents";
import { PaletteLabLazy as PaletteLab } from "./PaletteLabLazy";
import { getPreset } from "./palettePresets";
import { PALETTE_ATTRIBUTE, PALETTE_LAB_OVERRIDE_STYLE_ID } from "./paletteLabStorage";
import { setPaletteLabOpen } from "./paletteLabStore";
import { declinePendingShare } from "./paletteLabShare";
import { clearThemeBaselineCache } from "./presetBaselines";
import {
  MAX_SHARE_CODE_LENGTH,
  THEME_SHARE_CODEC_VERSION,
  THEME_SHARE_PARAM,
  encodeSharedTheme,
} from "./themeShareCodec";

/**
 * Share links, through this suite's one seam: *stored envelope in → applied
 * document state out*. Nothing below asserts on internal state — only on what
 * the injected override element says, what palette the root names, what is in
 * localStorage, and what the visitor is shown.
 *
 * The fresh-browser cases are the point of the ticket: a link arriving at an
 * editor who has never opened the Theme Lab must preview without writing, and
 * must land as a *new* slot beside anything they already had.
 */

const STORAGE_KEY = "dosewiki-palette-lab";

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
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
  clearThemeBaselineCache();
  setPaletteLabOpen(false);
  declinePendingShare();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
  declinePendingShare();
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
  window.history.replaceState({}, "", "/");
});

function palette() {
  return document.documentElement.getAttribute(PALETTE_ATTRIBUTE);
}

function injectedCss() {
  return document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.textContent ?? "";
}

function storedRaw() {
  return window.localStorage.getItem(STORAGE_KEY);
}

function stored() {
  return JSON.parse(storedRaw() ?? "{}");
}

/** A code for "Abyss, with the accent nudged" — the everyday share. */
function abyssCode(name = "Midnight") {
  const abyss = getPreset("abyss");
  return encodeSharedTheme({
    name,
    basePresetId: "abyss",
    overrides: {
      dark: { ...abyss.overrides.dark, "--theme-accent": "#abcdef" },
      light: { ...abyss.overrides.light },
    },
  });
}

/** Hand-mint a payload the way an attacker would. */
function mint(payload: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Open the link, then mount the tool the way the protected route does. */
async function visitWithCode(code: string) {
  window.history.replaceState({}, "", `/?${THEME_SHARE_PARAM}=${encodeURIComponent(code)}`);
  render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);
}

function invite() {
  return screen.findByRole("dialog", { name: "Shared theme" });
}

describe("Theme Lab share links", { timeout: 20_000 }, () => {
  it("previews a shared theme on a fresh browser without writing anything", async () => {
    await visitWithCode(abyssCode());
    const card = await invite();

    // The visitor can see what they are being offered, by name and by look.
    expect(within(card).getAllByText("Midnight").length).toBeGreaterThan(0);
    expect(palette()).toBe("abyss");
    expect(injectedCss()).toContain("--theme-accent:#abcdef");

    // …and nothing has been saved. A preview is not an adoption.
    await waitFor(() => expect(document.querySelector("[data-icon]")).toBeTruthy());
    expect(stored().customThemes ?? []).toEqual([]);
  });

  it("changes nothing when the visitor declines", async () => {
    // A visitor who already has a look of their own.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        activeThemeRef: { kind: "preset", id: "twilight" },
        editsByPreset: { twilight: { dark: { "--theme-accent": "#111111" }, light: {} } },
        customThemes: [],
        shareFormat: 1,
      }),
    );
    const before = storedRaw();

    await visitWithCode(abyssCode());
    const card = await invite();
    expect(palette()).toBe("abyss");

    await userEvent.click(within(card).getByRole("button", { name: "No thanks" }));

    // Their own look is back, exactly.
    await waitFor(() => expect(palette()).toBe("twilight"));
    expect(injectedCss()).toContain("--theme-accent:#111111");
    expect(injectedCss()).not.toContain("#abcdef");
    expect(screen.queryByRole("dialog", { name: "Shared theme" })).not.toBeInTheDocument();
    // Byte-identical storage: declining is a true no-op.
    expect(storedRaw()).toBe(before);
    // And the code is out of the address bar, so a reload doesn't ask again.
    expect(window.location.search).toBe("");
  });

  it("lands an accepted theme as a new slot, leaving existing themes untouched", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        activeThemeRef: { kind: "custom", id: "custom-1" },
        editsByPreset: { twilight: { dark: { "--theme-accent": "#111111" }, light: {} } },
        customThemes: [
          {
            id: "custom-1",
            name: "Mine",
            overrides: { dark: { "--theme-accent": "#222222" }, light: {} },
            basePresetId: "twilight",
          },
        ],
        shareFormat: 1,
      }),
    );

    await visitWithCode(abyssCode());
    const card = await invite();
    await userEvent.click(within(card).getByRole("button", { name: "Keep this theme" }));

    await waitFor(() => {
      const envelope = stored();
      expect(envelope.customThemes).toHaveLength(2);
      // The visitor's own slot is exactly as it was.
      expect(envelope.customThemes[0]).toEqual({
        id: "custom-1",
        name: "Mine",
        overrides: { dark: { "--theme-accent": "#222222" }, light: {} },
        basePresetId: "twilight",
      });
      // The shared one is new, named, and worn.
      const landed = envelope.customThemes[1];
      expect(landed.id).toBe("custom-2");
      expect(landed.name).toBe("Midnight");
      expect(landed.basePresetId).toBe("abyss");
      expect(landed.overrides.dark["--theme-accent"]).toBe("#abcdef");
      expect(envelope.activeThemeRef).toEqual({ kind: "custom", id: "custom-2" });
      // Preset tweaks are untouched.
      expect(envelope.editsByPreset.twilight.dark["--theme-accent"]).toBe("#111111");
    });

    // And it renders through the ordinary saved-theme path, not the preview.
    expect(palette()).toBe("abyss");
    expect(injectedCss()).toContain("--theme-accent:#abcdef");
    expect(screen.queryByRole("dialog", { name: "Shared theme" })).not.toBeInTheDocument();
  });

  it("reproduces the shared look exactly on a fresh browser", async () => {
    // What one visitor is wearing, captured the way the panel captures it.
    const abyss = getPreset("abyss");
    const shared = {
      dark: { ...abyss.overrides.dark, "--theme-accent": "#abcdef", "--radius": "0px" },
      light: { ...abyss.overrides.light, "--theme-accent": "#fedcba" },
    };
    const code = encodeSharedTheme({ name: "Sharp Abyss", basePresetId: "abyss", overrides: shared });

    await visitWithCode(code);
    const card = await invite();
    await userEvent.click(within(card).getByRole("button", { name: "Keep this theme" }));

    await waitFor(() => expect(stored().customThemes).toHaveLength(1));
    const landed = stored().customThemes[0];
    // Token for token, both themes: the recipient holds the same look.
    expect(landed.overrides).toEqual(shared);
    expect(palette()).toBe("abyss");
    expect(injectedCss()).toContain("--radius:0px");
  });

  it("refuses an oversize link gracefully", async () => {
    await visitWithCode("A".repeat(MAX_SHARE_CODE_LENGTH + 10));
    const card = await invite();

    expect(within(card).getByText(/too large/i)).toBeInTheDocument();
    // Nothing was previewed and nothing was stored: the visitor keeps the
    // stock look they arrived with.
    expect(palette()).toBe("orchid");
    expect(injectedCss()).toBe("");
    expect(within(card).queryByRole("button", { name: "Keep this theme" })).not.toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "Dismiss" }));
    expect(stored().customThemes ?? []).toEqual([]);
  });

  it("refuses a link that sets anything outside the token registry", async () => {
    await visitWithCode(
      mint({
        v: THEME_SHARE_CODEC_VERSION,
        n: "Hostile",
        b: "orchid",
        d: { "--not-a-theme-token": "red" },
        l: {},
      }),
    );
    const card = await invite();

    expect(within(card).getByText(/isn’t a Theme Lab color/i)).toBeInTheDocument();
    expect(injectedCss()).toBe("");
    expect(within(card).queryByRole("button", { name: "Keep this theme" })).not.toBeInTheDocument();
  });

  it("refuses a link whose value would escape the declaration it sits in", async () => {
    await visitWithCode(
      mint({
        v: THEME_SHARE_CODEC_VERSION,
        n: "Hostile",
        b: "orchid",
        d: { "~accent": "red;position:fixed" },
        l: {},
      }),
    );
    const card = await invite();

    expect(within(card).getByText(/won’t apply/i)).toBeInTheDocument();
    expect(injectedCss()).not.toContain("position:fixed");
  });

  it("refuses a link whose value would call home, before the visitor decides", async () => {
    // The auto-preview is the exposure: a value that fetches a remote asset
    // would leak the visit the moment the link opened, whatever the visitor
    // then chose. `--theme-scroll-thumb-bg` is painted through a `background`
    // shorthand, which takes an <image>, and `image-set()` never says `url(`.
    await visitWithCode(
      mint({
        v: THEME_SHARE_CODEC_VERSION,
        n: "Beacon",
        b: "orchid",
        d: { "~scroll-thumb-bg": 'image-set("https://evil.example/beacon.png" 1x)' },
        l: {},
      }),
    );
    const card = await invite();

    expect(within(card).getByText(/won’t apply/i)).toBeInTheDocument();
    // Nothing reached the document: no declaration, and no offer to keep it.
    expect(injectedCss()).toBe("");
    expect(injectedCss()).not.toContain("evil.example");
    expect(document.documentElement.outerHTML).not.toContain("evil.example");
    expect(within(card).queryByRole("button", { name: "Keep this theme" })).not.toBeInTheDocument();
  });

  it("shares the look being worn, and takes a pasted code back through the preview", async () => {
    render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);
    act(() => setPaletteLabOpen(true));
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });

    await userEvent.click(within(panel).getByRole("button", { name: /^Abyss/ }));
    await userEvent.click(within(panel).getByRole("button", { name: /^Share/ }));

    // The code is what a link carries, so it has to survive a query string
    // untouched.
    const clipboard: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text: string) => (clipboard.push(text), Promise.resolve()) },
    });
    await userEvent.click(within(panel).getByRole("button", { name: "Copy code" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(clipboard).toHaveLength(2));

    const [code, link] = clipboard;
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(new URL(link).searchParams.get(THEME_SHARE_PARAM)).toBe(code);

    // Pasting it back previews rather than applying.
    const field = within(panel).getByRole("textbox", { name: "Theme share code" });
    await userEvent.click(field);
    await userEvent.paste(code);
    await userEvent.click(within(panel).getByRole("button", { name: "Preview" }));

    const card = await invite();
    expect(within(card).getAllByText("Abyss").length).toBeGreaterThan(0);
    await userEvent.click(within(card).getByRole("button", { name: "Keep this theme" }));

    await waitFor(() => {
      const envelope = stored();
      expect(envelope.customThemes).toHaveLength(1);
      expect(envelope.customThemes[0].name).toBe("Abyss");
      expect(envelope.customThemes[0].basePresetId).toBe("abyss");
    });
  });

  it("hands a tuned accent back as a table entry, with the swatch measured", async () => {
    // The other direction of "I am done tuning": out of the browser and into
    // `accents.ts`. Nine seeds in light, eight in dark, and a swatch read from
    // Fun dark — none of which is the combination the editor is looking at, so all
    // three are measured rather than taken off the page in front of them.
    const lightSeeds = Object.fromEntries(
      PRO_ACCENT_SEED_NAMES.light.map((id, index) => [id, `#00000${index + 1}`]),
    );
    const darkSeeds = Object.fromEntries(
      PRO_ACCENT_SEED_NAMES.dark.map((id, index) => [id, `#0000${11 + index}`]),
    );
    const fixture = document.createElement("style");
    fixture.textContent = [
      'html[data-theme="dark"]{--theme-accent:#a5f3fc;}',
      `html[data-visual-style="pro"][data-theme="light"]{${Object.entries(lightSeeds)
        .map(([id, value]) => `${id}:${value};`)
        .join("")}}`,
      `html[data-visual-style="pro"][data-theme="dark"]{${Object.entries(darkSeeds)
        .map(([id, value]) => `${id}:${value};`)
        .join("")}}`,
    ].join("");
    document.head.appendChild(fixture);

    try {
      render(<AppearanceTestProvider><PaletteLab /></AppearanceTestProvider>);
      act(() => setPaletteLabOpen(true));
      const panel = await screen.findByRole("dialog", { name: "Theme Lab" });

      await userEvent.click(within(panel).getByRole("button", { name: /^Abyss/ }));
      await userEvent.click(within(panel).getByRole("button", { name: /^Share/ }));

      const clipboard: string[] = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (text: string) => (clipboard.push(text), Promise.resolve()) },
      });
      // The button names the accent being edited, which is the default one here.
      await userEvent.click(within(panel).getByRole("button", { name: "Copy Default entry" }));
      await waitFor(() => expect(clipboard).toHaveLength(1));

      const entry = clipboard[0];
      // Paste-ready: the binding `accents.ts` uses for this accent, the three
      // hand-picked fields filled with the combination it was measured in, and the
      // swatch as rendered rather than a placeholder.
      expect(entry).toContain("const defaultAccent: Accent = {");
      expect(entry).toContain('id: "default",');
      expect(entry).toContain('label: "Default",');
      expect(entry).toContain('funPresetId: "abyss",');
      expect(entry).toContain('swatch: "#a5f3fc",');
      for (const [id, value] of Object.entries(lightSeeds)) {
        expect(entry, `light ${id}`).toContain(`"${id}": "${value}",`);
      }
      for (const [id, value] of Object.entries(darkSeeds)) {
        expect(entry, `dark ${id}`).toContain(`"${id}": "${value}",`);
      }
      // Stated in BOTH halves, at the same value: the charcoal rails that read it carry no
      // data-theme, but an accent's blocks are per-scheme, so a light-only restatement leaves a
      // dark Pro page on the authored teal. The two occurrences are what the export owes it.
      expect(entry.split('"--ei-accent-on-dark"')).toHaveLength(3);
      expect(entry.trimEnd().endsWith("};")).toBe(true);

      // Nothing was left behind by the measurement: the editor is still looking at
      // the combination they were.
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun");
    } finally {
      fixture.remove();
    }
  });
});
