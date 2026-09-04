import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";
import { ThemeLabLazy as ThemeLab } from "./ThemeLabLazy";
import tailwindConfig from "../../../tailwind.config.mjs";
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
  THEME_LAB_FONT_STYLE_ID,
  buildFontFaceCss,
  registeredFontChoiceIds,
  resetFontFaceRegistry,
} from "./fontFaces";
import {
  PRO_STYLE_FONTS,
  FONT_CHOICES,
  FONT_GROUP,
  FONT_TOKEN_IDS,
  fontChoiceForValue,
  getFontChoice,
  leadingFamily,
} from "./paletteTokensFonts";

/**
 * Typography as a theme axis, tested at the lab's one real seam:
 * *stored envelope in → applied document state out*.
 *
 * A font choice is only real if it reaches the injected override element and
 * the persisted envelope — the same two places a color edit has to reach. The
 * one thing fonts add on top is the *bytes*: the formal face's `@font-face`
 * block must not exist in the document until an editor has actually asked for
 * it, which is asserted here as the absence of the element that would carry it.
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

function faceCss() {
  return document.getElementById(THEME_LAB_FONT_STYLE_ID)?.textContent ?? null;
}

function stored() {
  return window.localStorage.getItem(THEME_LAB_STORAGE_KEY) ?? "";
}

const TITILLIUM = getFontChoice("titillium")!;

/** One face row inside the editor's picker, scoped away from the catalog row
 *  behind it (whose accessible name also carries the face it is wearing) and
 *  from the appearance panel's "Surface" group, whose name also ends in
 *  "face". */
function faceButton(panel: HTMLElement, name: RegExp) {
  return within(within(panel).getByRole("group", { name: /\bface$/ })).getByRole("button", { name });
}

/** The look `AppearanceTestProvider` opens on: the style pinned to Fun. Edits are
 *  keyed by look, so a seeded envelope has to name the look the panel will
 *  actually be editing. */
const OPEN_LOOK = lookKey(DEFAULT_LOOK);

/** Envelope with one token pinned on the worn look's dark map. */
function envelopeWithFont(tokenId: string, stack: string) {
  return JSON.stringify({
    version: 5,
    editsByLook: { [OPEN_LOOK]: { dark: { [tokenId]: stack }, light: {} } },
    roleEditsByLook: {},
  });
}

beforeEach(() => {
  installMockStorage();
  document.documentElement.setAttribute("data-theme", "dark");
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
  resetFontFaceRegistry();
  clearThemeBaselineCache();
  setThemeLabOpen(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID)?.remove();
  resetFontFaceRegistry();
});

describe("font token group", () => {
  it("registers both font families as pickable tokens in the shared registry", () => {
    const group = PALETTE_GROUPS.find((entry) => entry.id === FONT_GROUP.id);
    expect(group, "the font group must be registered, not just exported").toBeTruthy();

    expect([...FONT_TOKEN_IDS]).toEqual(["--font-family-body", "--font-family-display"]);
    for (const id of FONT_TOKEN_IDS) {
      // In the registry, so the preset structural-invariant whitelist admits it
      // and the baseline sampler reads it.
      expect(ALL_TOKEN_IDS, `${id} must be a registry token`).toContain(id);
      expect(getToken(id)?.kind, `${id} must be picked, not typed`).toBe("font");
    }
  });

  it("surfaces both faces in the plainly-named Essentials view", () => {
    for (const id of FONT_TOKEN_IDS) expect(ESSENTIAL_IDS).toContain(id);
  });

  it("offers a closed list of real faces, with a way back to the theme's own", () => {
    expect(FONT_CHOICES[0].id).toBe("default");
    expect(FONT_CHOICES[0].stack, "theme default is the absence of a value").toBe("");
    // Everything else is a stack the site can actually render, and each ends in
    // a generic family so an unavailable face never lands on nothing.
    for (const choice of FONT_CHOICES.slice(1)) {
      expect(choice.stack, `${choice.id} needs a stack`).not.toBe("");
      expect(choice.stack, `${choice.id} needs a generic fallback`).toMatch(
        /(sans-serif|serif|monospace)$/,
      );
    }
    expect(new Set(FONT_CHOICES.map((choice) => choice.id)).size).toBe(FONT_CHOICES.length);
  });

  it("recognises a face from a stack the browser has re-spelled", () => {
    // `getComputedStyle` substitutes `var()` and re-spaces the list, so matching
    // is on the leading family, not the literal string.
    expect(fontChoiceForValue(TITILLIUM.stack).id).toBe("titillium");
    expect(fontChoiceForValue('"Titillium Web", Inter, sans-serif').id).toBe("titillium");
    expect(fontChoiceForValue("Titillium Web,Inter").id).toBe("titillium");
    expect(leadingFamily('  "Titillium Web" , Inter ')).toBe("titillium web");
    // next/font's hashed family name, which is what an untouched token computes
    // to, is nobody's choice — the honest answer is "you have not pinned one".
    expect(fontChoiceForValue("__Blinker_1a2b3c, Inter, sans-serif").id).toBe("default");
    expect(fontChoiceForValue("").id).toBe("default");
    expect(fontChoiceForValue(undefined).id).toBe("default");
  });

  it("charges a download for exactly one choice", () => {
    const paid = FONT_CHOICES.filter((choice) => choice.faces);
    expect(paid.map((choice) => choice.id)).toEqual(["titillium"]);
    for (const face of TITILLIUM.faces!) {
      if (!face.src) continue;
      expect(face.src, "faces come from our own static assets").toMatch(
        /^\/fonts\/titillium-web\/[a-z0-9-]+\.woff2$/,
      );
    }
  });

  it("ships a metric-matched fallback so the late swap does not reflow", () => {
    // The one real risk of loading a face late: a restored choice paints in the
    // fallback and swaps when the woff2 lands. A re-scaled local face keeps that
    // swap to letterforms rather than line boxes.
    const fallback = TITILLIUM.faces!.find((face) => face.local);
    expect(fallback, "the lazy face needs a metric-matched stand-in").toBeTruthy();
    expect(fallback!.src, "a fallback that downloads is not a fallback").toBeUndefined();
    expect(fallback!.sizeAdjust).toBeTruthy();
    expect(fallback!.ascentOverride).toBeTruthy();
    // …and it has to be *in* the stack, or nothing ever renders with it.
    expect(TITILLIUM.stack).toContain(fallback!.family);
    const css = buildFontFaceCss(TITILLIUM);
    expect(css).toContain("size-adjust:94.44%");
    expect(css).toContain("font-display:swap");
    expect(css).toContain('local("Arial")');
  });

  it("can express the Pro style's type with no component change", () => {
    // The self-check from the investigation: the Pro skin re-points the same two
    // variables these tokens sit behind. If its type is expressible here, the
    // control is wired to the real mechanism.
    expect(Object.keys(PRO_STYLE_FONTS).sort()).toEqual([...FONT_TOKEN_IDS].sort());
    for (const value of Object.values(PRO_STYLE_FONTS)) {
      expect(fontChoiceForValue(value).id).toBe("titillium");
    }
  });
});

/**
 * The two things about fonts that no runtime assertion can see, because they
 * only fail as a 404 in the network panel or as a face that quietly changes
 * nothing. Source/asset checks, in the spirit of `siteFont.test.ts`.
 */
describe("font wiring outside the runtime", () => {
  it("ships every face file the lazy declaration points at", () => {
    const root = resolve(process.cwd());
    for (const face of TITILLIUM.faces!) {
      if (!face.src) continue;
      // A declared face whose woff2 is missing costs a request and renders the
      // fallback forever — the failure mode this whole feature is built around.
      expect(existsSync(resolve(root, "public", face.src.replace(/^\//, ""))), face.src).toBe(true);
    }
  });

  it("routes the display utility through the token the control writes", () => {
    // Tailwind's `font-display` family is the site's other type surface (the
    // wordmark and every page h1 wear it). It used to name the raw next/font
    // variable, which no theme can reach; it now reads the same token this
    // control writes, so a display-face choice covers the whole site.
    expect(tailwindConfig.theme.extend.fontFamily.display).toEqual(["var(--font-family-display)"]);
  });
});

describe("font choices through the lab's seam", { timeout: 15_000 }, () => {
  it("applies a saved face on load with the panel never opened", async () => {
    installMockStorage(envelopeWithFont("--font-family-body", TITILLIUM.stack));

    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);

    await waitFor(() => expect(overrideCss()).toContain("--font-family-body:"));
    expect(overrideCss()).toContain("Titillium Web");
    expect(overrideCss()).toContain('html[data-theme="dark"]');
    expect(screen.queryByRole("dialog", { name: "Theme Lab" })).not.toBeInTheDocument();
  });

  it("registers the formal face only once a rendered theme names it", async () => {
    // A visitor with a saved theme that touches everything *except* type: the
    // runtime restores it in full, and still declares no face.
    installMockStorage(envelopeWithFont("--radius", "0rem"));

    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);
    await waitFor(() => expect(overrideCss()).toContain("--radius:0rem"));

    // The whole promise: a visitor who never picks it has no declaration in the
    // document, so there is nothing for the browser to fetch.
    expect(faceCss(), "nothing should declare the formal face yet").toBeNull();
    expect(registeredFontChoiceIds()).toEqual([]);
  });

  it("registers the formal face when a saved theme restores it", async () => {
    installMockStorage(envelopeWithFont("--font-family-body", TITILLIUM.stack));

    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);

    await waitFor(() => expect(registeredFontChoiceIds()).toEqual(["titillium"]));
    const css = faceCss() ?? "";
    expect(css).toContain('font-family:"Titillium Web"');
    expect(css).toContain('url("/fonts/titillium-web/titillium-web-400-normal-latin.woff2")');
    expect(css).toContain("unicode-range:");
  });

  it("picks a face in the editor, applies it site-wide, and persists it per theme", async () => {
    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);
    act(() => setThemeLabOpen(true));
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });

    await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
    await userEvent.click(within(panel).getByRole("button", { name: /Body text face/ }));

    // Nothing has been chosen yet, so nothing has been declared yet.
    expect(faceCss()).toBeNull();

    await userEvent.click(faceButton(panel, /Titillium Web/));

    expect(overrideCss()).toContain("--font-family-body:");
    expect(overrideCss()).toContain("Titillium Web");
    // Built from userLayerSelector rather than spelled out: the repeated
    // attribute is a cascade rank that module owns, and hardcoding it here
    // makes the negative assertion below silently unfailable the moment the
    // rank moves. The dark block heads a two-selector list so the dark chrome
    // island (the header on a light page) wears the visitor's dark edits too.
    expect(overrideCss()).toContain(userLayerSelector("dark"));
    // No *light* user layer: editing dark must not write light's own block.
    expect(overrideCss()).not.toContain(`${userLayerSelector("light")}{`);
    // …and only now does the face exist in the document.
    await waitFor(() => expect(registeredFontChoiceIds()).toEqual(["titillium"]));

    await waitFor(() => expect(stored()).toContain('"--font-family-body"'));
    expect(stored()).toContain("Titillium Web");
  });

  it("switches back to the theme's own face by clearing the choice", async () => {
    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);
    act(() => setThemeLabOpen(true));
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });

    await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
    await userEvent.click(within(panel).getByRole("button", { name: /Headings & display face/ }));
    await userEvent.click(faceButton(panel, /Titillium Web/));
    expect(overrideCss()).toContain("Titillium Web");

    await userEvent.click(faceButton(panel, /Theme default/));

    expect(overrideCss()).not.toContain("--font-family-display:");
    // Going back does not un-declare the face — the bytes are already here, and
    // re-writing the element would restart any in-flight download.
    expect(registeredFontChoiceIds()).toEqual(["titillium"]);
  });

  it("costs nothing to pick a face the visitor's machine already has", async () => {
    render(<AppearanceTestProvider><ThemeLab /></AppearanceTestProvider>);
    act(() => setThemeLabOpen(true));
    const panel = await screen.findByRole("dialog", { name: "Theme Lab" });

    await userEvent.click(within(panel).getByRole("button", { name: /All colors/ }));
    await userEvent.click(within(panel).getByRole("button", { name: /Body text face/ }));
    await userEvent.click(faceButton(panel, /^Serif$/));

    expect(overrideCss()).toContain("ui-serif");
    expect(faceCss(), "a system face declares nothing").toBeNull();
  });
});
