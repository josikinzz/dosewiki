import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import {
  APPEARANCE_META_COLORS,
  FONT_STORAGE_KEY,
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  LETTER_SPACING_STORAGE_KEY,
  LINE_HEIGHT_STORAGE_KEY,
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  DEFAULT_COLOR_SCHEME,
  DEFAULT_VISUAL_STYLE,
  LEGACY_ACCENT_TO_HUE,
  LEGACY_SURFACE_TO_HUE,
  SUPPORTED_COLOR_SCHEMES,
  SUPPORTED_VISUAL_STYLES,
  THEME_META_ID,
  VISUAL_STYLE_STORAGE_KEY,
  buildThemeBootstrapScript,
  getAppearanceMetaColor,
  getInitialAppearance,
  isColorScheme,
  isFontPreference,
} from "./index";
import { isVisualStyle } from "./visualStyle";
import {
  ACCENT_HUE_PROPERTY,
  ACCENT_LEVEL_PROPERTY,
  CHROMA_STYLESHEET_HREF,
  CHROMA_STYLESHEET_LINK_ID,
  CHROMA_SUPPORT_PROBE,
  DEFAULT_APPEARANCE_COLORS,
  SURFACE_HUE_PROPERTY,
  SURFACE_LEVEL_PROPERTY,
} from "./appearanceChroma";
import {
  READER_LEADING_ATTRIBUTE,
  READER_LEADING_PROPERTY,
  READER_TRACKING_PROPERTY,
  TEXT_SIZE_PROPERTY,
} from "./appearanceTypography";
import {
  LIGHT_MODE_STYLESHEET_HREF,
  LIGHT_MODE_STYLESHEET_LINK_ID,
  PRO_THEME_STYLESHEET_HREF,
  PRO_THEME_STYLESHEET_LINK_ID,
} from "./appearanceSheets";

const DOSEWIKI = SITE_FLAVOR_CONFIGS.dosewiki;
const EFFECT_INDEX = SITE_FLAVOR_CONFIGS.effectindex;

function installMockStorage(stored: Record<string, string> = {}) {
  const store = new Map(Object.entries(stored));

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, nextValue: string) => {
        store.set(key, String(nextValue));
      },
    },
  });
}

function ensureThemeMeta() {
  const meta = document.createElement("meta");
  meta.id = THEME_META_ID;
  meta.name = "theme-color";
  document.head.appendChild(meta);

  return meta;
}

describe("theme token interface", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-visual-style");
    document.documentElement.style.colorScheme = "";
    // The dose.wiki script engages the colour axes on every run now, so each
    // test starts from a document that carries none of them.
    delete document.documentElement.dataset.chroma;
    document.documentElement.style.removeProperty(SURFACE_LEVEL_PROPERTY);
    document.documentElement.style.removeProperty(ACCENT_LEVEL_PROPERTY);
    document.documentElement.style.removeProperty(SURFACE_HUE_PROPERTY);
    document.documentElement.style.removeProperty(ACCENT_HUE_PROPERTY);
    delete document.documentElement.dataset.font;
    document.documentElement.style.removeProperty(TEXT_SIZE_PROPERTY);
    document.documentElement.style.removeProperty(READER_TRACKING_PROPERTY);
    document.documentElement.removeAttribute(READER_LEADING_ATTRIBUTE);
    document.documentElement.style.removeProperty(READER_LEADING_PROPERTY);
  });

  it("names both appearance axes, their storage keys, and the meta-colour matrix", () => {
    expect(SUPPORTED_COLOR_SCHEMES).toEqual(["light", "dark"]);
    expect(SUPPORTED_VISUAL_STYLES).toEqual(["fun", "pro"]);
    expect(DEFAULT_COLOR_SCHEME).toBe("dark");
    expect(DEFAULT_VISUAL_STYLE).toBe("fun");
    // The scheme key is unchanged from the single-axis era: saved day/night preferences have
    // to survive the second axis arriving.
    expect(COLOR_SCHEME_STORAGE_KEY).toBe("dosewiki-theme");
    expect(VISUAL_STYLE_STORAGE_KEY).toBe("dosewiki-visual-style");
    // The chroma keys predate the hue axes and avoid "dosewiki-accent"/"dosewiki-surface"
    // as prefixes; the hue keys extend the retired colourway keys' names, which is safe
    // because a locked publication's script carries no colour-axis machinery at all —
    // asserted below against every one of these keys.
    expect(SURFACE_CHROMA_STORAGE_KEY).toBe("dosewiki-chroma-surface");
    expect(ACCENT_CHROMA_STORAGE_KEY).toBe("dosewiki-chroma-accent");
    expect(SURFACE_HUE_STORAGE_KEY).toBe("dosewiki-surface-hue");
    expect(ACCENT_HUE_STORAGE_KEY).toBe("dosewiki-accent-hue");
    // The retired colourway keys survive as migration inputs only.
    expect(SURFACE_STORAGE_KEY).toBe("dosewiki-surface");
    expect(ACCENT_STORAGE_KEY).toBe("dosewiki-accent");
    // The type axis's key. Holds one of the paintable faces; the default (Lexend) stores
    // nothing, and the binary-toggle era's "dyslexic" reads as the default.
    expect(FONT_STORAGE_KEY).toBe("dosewiki-font");
    // The reading-type axes' keys. Each holds only a saved slider value; paragraph
    // spacing has no key — that rhythm is a fixed site value, not a preference.
    expect(TEXT_SIZE_STORAGE_KEY).toBe("dosewiki-text-size");
    expect(LETTER_SPACING_STORAGE_KEY).toBe("dosewiki-letter-spacing");
    expect(LINE_HEIGHT_STORAGE_KEY).toBe("dosewiki-line-height");

    expect(isColorScheme("light")).toBe(true);
    expect(isColorScheme("sepia")).toBe(false);
    expect(isVisualStyle("fun")).toBe(true);
    expect(isVisualStyle("pro")).toBe(true);
    // The axes are not interchangeable: a scheme value is not a style value.
    expect(isVisualStyle("dark")).toBe(false);
    expect(isColorScheme("pro")).toBe(false);
    expect(isFontPreference("lexend")).toBe(true);
    expect(isFontPreference("inter")).toBe(true);
    expect(isFontPreference("blinker")).toBe(true);
    expect(isFontPreference("titillium")).toBe(true);
    expect(isFontPreference("system")).toBe(true);
    // The retired binary-toggle value maps onto the default, never a face.
    expect(isFontPreference("dyslexic")).toBe(false);
    expect(isFontPreference("papyrus")).toBe(false);

    // A complete matrix, because the pre-paint script uses it as the validity set for both
    // stored preferences — a missing row would make a supported value look unsupported.
    for (const visualStyle of SUPPORTED_VISUAL_STYLES) {
      for (const colorScheme of SUPPORTED_COLOR_SCHEMES) {
        expect(getAppearanceMetaColor({ colorScheme, visualStyle })).toBe(
          APPEARANCE_META_COLORS[visualStyle][colorScheme],
        );
        expect(getAppearanceMetaColor({ colorScheme, visualStyle })).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });


  it("restores both saved preferences before paint", () => {
    installMockStorage({
      [COLOR_SCHEME_STORAGE_KEY]: "light",
      [VISUAL_STYLE_STORAGE_KEY]: "pro",
    });
    const meta = ensureThemeMeta();

    // dose.wiki explicitly, not the ambient flavor: this is the both-axes-selectable path.
    Function(buildThemeBootstrapScript(DOSEWIKI))();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.visualStyle).toBe("pro");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(meta.content).toBe(APPEARANCE_META_COLORS.pro.light);
  });

  it("falls back per axis, so one unsupported value cannot drag the other to its default", () => {
    installMockStorage({
      [COLOR_SCHEME_STORAGE_KEY]: "sepia",
      [VISUAL_STYLE_STORAGE_KEY]: "pro",
    });
    const meta = ensureThemeMeta();

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    expect(document.documentElement.dataset.theme).toBe(DOSEWIKI.defaultColorScheme);
    expect(document.documentElement.dataset.visualStyle).toBe("pro");
    expect(meta.content).toBe(APPEARANCE_META_COLORS.pro.dark);
  });

  it("keeps a supported scheme when the saved style is unsupported", () => {
    installMockStorage({
      [COLOR_SCHEME_STORAGE_KEY]: "light",
      [VISUAL_STYLE_STORAGE_KEY]: "journal",
    });
    const meta = ensureThemeMeta();

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.visualStyle).toBe(DOSEWIKI.defaultVisualStyle);
    expect(meta.content).toBe(APPEARANCE_META_COLORS.fun.light);
  });

  it('resolves a stored "system" through prefers-color-scheme before paint', () => {
    installMockStorage({ [COLOR_SCHEME_STORAGE_KEY]: "system" });
    const meta = ensureThemeMeta();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true, media: "(prefers-color-scheme: light)" }),
    );

    try {
      Function(buildThemeBootstrapScript(DOSEWIKI))();

      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.style.colorScheme).toBe("light");
      expect(meta.content).toBe(APPEARANCE_META_COLORS.fun.light);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('costs only the scheme its default when "system" is stored and matchMedia throws', () => {
    installMockStorage({
      [COLOR_SCHEME_STORAGE_KEY]: "system",
      [VISUAL_STYLE_STORAGE_KEY]: "pro",
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => {
        throw new Error("matchMedia blocked");
      }),
    );

    try {
      Function(buildThemeBootstrapScript(DOSEWIKI))();

      expect(document.documentElement.dataset.theme).toBe(DOSEWIKI.defaultColorScheme);
      expect(document.documentElement.dataset.visualStyle).toBe("pro");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to both declared defaults when storage throws", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("storage blocked");
        },
      },
    });
    ensureThemeMeta();

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    expect(document.documentElement.dataset.theme).toBe(DOSEWIKI.defaultColorScheme);
    expect(document.documentElement.dataset.visualStyle).toBe(DOSEWIKI.defaultVisualStyle);
    expect(document.documentElement.style.colorScheme).toBe(DOSEWIKI.defaultColorScheme);
  });

  it("opens each publication on its own declared appearance", () => {
    // The colourway axes are gone: an initial appearance is just the two attribute axes.
    // dose.wiki opens on the authored Orchid/Default base, softened by the site-default
    // saturation levels and hue rotations the bootstrap paints.
    expect(getInitialAppearance(DOSEWIKI)).toEqual({
      colorScheme: "dark",
      visualStyle: "fun",
    });
    expect(getInitialAppearance(EFFECT_INDEX)).toEqual({
      colorScheme: "light",
      visualStyle: "pro",
    });
    // The locked style's light tint is that publication's own manifest colour, so the address
    // bar and the installed app agree instead of flashing the shared lilac-white.
    expect(getAppearanceMetaColor(getInitialAppearance(EFFECT_INDEX))).toBe(
      EFFECT_INDEX.manifest.themeColor,
    );
  });

  it("applies a locked style without ever consulting its storage key", () => {
    installMockStorage({
      [COLOR_SCHEME_STORAGE_KEY]: "dark",
      [VISUAL_STYLE_STORAGE_KEY]: "fun",
    });
    const getItem = vi.spyOn(window.localStorage, "getItem");
    const meta = ensureThemeMeta();

    Function(buildThemeBootstrapScript(EFFECT_INDEX))();

    expect(getItem.mock.calls.flat()).toEqual([COLOR_SCHEME_STORAGE_KEY]);
    expect(document.documentElement.dataset.visualStyle).toBe("pro");
    // The unlocked axis still restores, so a locked style does not cost night mode.
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(meta.content).toBe(APPEARANCE_META_COLORS.pro.dark);
  });

  it("engages saved saturation levels and hue rotations before paint: attribute, properties, stylesheet link", () => {
    installMockStorage({
      [SURFACE_CHROMA_STORAGE_KEY]: "0.35",
      [ACCENT_CHROMA_STORAGE_KEY]: "1",
      [SURFACE_HUE_STORAGE_KEY]: "40",
      [ACCENT_HUE_STORAGE_KEY]: "300",
      // Saved hues outrank saved colourway ids: the ids are only a fallback.
      [SURFACE_STORAGE_KEY]: "abyss",
      [ACCENT_STORAGE_KEY]: "green",
    });
    const setItem = vi.spyOn(window.localStorage, "setItem");
    ensureThemeMeta();

    try {
      Function(buildThemeBootstrapScript(DOSEWIKI))();

      const root = document.documentElement;
      expect(root.dataset.chroma).toBe("");
      expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe("0.35");
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("1");
      expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY)).toBe("40");
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("300");
      const link = document.getElementById(CHROMA_STYLESHEET_LINK_ID);
      expect(link).toBeInstanceOf(HTMLLinkElement);
      expect((link as HTMLLinkElement).getAttribute("href")).toBe(CHROMA_STYLESHEET_HREF);
      // Pre-paint is read-only: persistence (and legacy-key removal) is the provider's job.
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();
    }
  });

  it("leaves the colour axes disengaged in a browser that cannot parse the chroma sheet", () => {
    // The sheet is relative colour syntax with bare-number hue sums, which Safari 16.4 to
    // 17.x rejects (h is an angle in that draft) and 16.3 and older cannot parse at all.
    // The script asks CSS.supports for that exact grammar and, on no, writes none of the
    // attribute, the properties or the link: the base sheets' authored palette paints.
    installMockStorage({
      [SURFACE_CHROMA_STORAGE_KEY]: "0.35",
      [ACCENT_CHROMA_STORAGE_KEY]: "1",
      [SURFACE_HUE_STORAGE_KEY]: "40",
      [ACCENT_HUE_STORAGE_KEY]: "300",
    });
    ensureThemeMeta();
    const supports = vi.spyOn(CSS, "supports").mockImplementation(
      (property: string, value?: string) => !(property === "color" && value === CHROMA_SUPPORT_PROBE),
    );
    const script = buildThemeBootstrapScript(DOSEWIKI);

    try {
      Function(script)();

      expect(supports).toHaveBeenCalledWith("color", CHROMA_SUPPORT_PROBE);
      const root = document.documentElement;
      expect(root.dataset.chroma).toBeUndefined();
      for (const property of [
        SURFACE_LEVEL_PROPERTY,
        ACCENT_LEVEL_PROPERTY,
        SURFACE_HUE_PROPERTY,
        ACCENT_HUE_PROPERTY,
      ]) {
        expect(root.style.getPropertyValue(property), property).toBe("");
      }
      expect(document.getElementById(CHROMA_STYLESHEET_LINK_ID)).toBeNull();
      // The rest of the bootstrap is unaffected: the scheme and style still paint.
      expect(root.dataset.theme).toBe("dark");
      expect(root.dataset.visualStyle).toBe("fun");
    } finally {
      supports.mockRestore();
    }
  });

  it("adopts a server-rendered stylesheet link instead of appending a duplicate", () => {
    // The layout renders the <link> in authored HTML now (parser-discoverable, so it
    // downloads in parallel with the document); the bootstrap's creation is only a
    // defensive fallback for a document missing that markup. The creation tests around
    // this one exercise the fallback on a bare head; this asserts the normal path: the
    // server's element survives untouched and stays the only copy.
    installMockStorage({});
    ensureThemeMeta();
    const server = document.createElement("link");
    server.id = CHROMA_STYLESHEET_LINK_ID;
    server.rel = "stylesheet";
    server.href = CHROMA_STYLESHEET_HREF;
    document.head.appendChild(server);

    try {
      Function(buildThemeBootstrapScript(DOSEWIKI))();

      expect(document.getElementById(CHROMA_STYLESHEET_LINK_ID)).toBe(server);
      expect(
        document.querySelectorAll(`link#${CHROMA_STYLESHEET_LINK_ID}`),
      ).toHaveLength(1);
      // Skipping the link is not skipping the axes: the root still engages.
      expect(document.documentElement.dataset.chroma).toBe("");
    } finally {
      server.remove();
    }
  });

  it("engages the site defaults for a reader with nothing saved, and for garbage values", () => {
    // "" and "1.5" and "abc" must all resolve to the default level: Number("") is 0,
    // which would otherwise silently pin a level the reader never chose. The hue
    // grammar is stricter — an integer degree count in 0..359.
    const defaults = DEFAULT_APPEARANCE_COLORS.fun.dark;
    for (const garbage of [null, "", "1.5", "-20", "abc", "360", "40px"]) {
      installMockStorage(
        garbage === null
          ? {}
          : {
              [SURFACE_CHROMA_STORAGE_KEY]: garbage,
              [ACCENT_CHROMA_STORAGE_KEY]: garbage,
              [SURFACE_HUE_STORAGE_KEY]: garbage,
              [ACCENT_HUE_STORAGE_KEY]: garbage,
            },
      );
      ensureThemeMeta();
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();

      Function(buildThemeBootstrapScript(DOSEWIKI))();

      const root = document.documentElement;
      expect(root.dataset.chroma, String(garbage)).toBe("");
      expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY), String(garbage)).toBe(
        String(defaults.surfaceLevel),
      );
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY), String(garbage)).toBe(
        String(defaults.accentLevel),
      );
      expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY), String(garbage)).toBe(
        String(defaults.surfaceHue),
      );
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY), String(garbage)).toBe(
        String(defaults.accentHue),
      );
      const link = document.getElementById(CHROMA_STYLESHEET_LINK_ID);
      expect(link, String(garbage)).toBeInstanceOf(HTMLLinkElement);
      expect((link as HTMLLinkElement).getAttribute("href")).toBe(CHROMA_STYLESHEET_HREF);
    }
  });

  it("resolves all four palette defaults from the appearance it just painted", () => {
    for (const style of ["fun", "pro"] as const) {
      for (const scheme of ["light", "dark"] as const) {
        installMockStorage({
          [VISUAL_STYLE_STORAGE_KEY]: style,
          [COLOR_SCHEME_STORAGE_KEY]: scheme,
        });
        ensureThemeMeta();
        document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();

        Function(buildThemeBootstrapScript(DOSEWIKI))();

        const expected = DEFAULT_APPEARANCE_COLORS[style][scheme];
        const root = document.documentElement;
        expect(root.dataset.visualStyle, `${style} ${scheme}`).toBe(style);
        expect(root.dataset.theme, `${style} ${scheme}`).toBe(scheme);
        expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY), `${style} ${scheme}`).toBe(
          String(expected.surfaceLevel),
        );
        expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY), `${style} ${scheme}`).toBe(
          String(expected.accentLevel),
        );
        expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY), `${style} ${scheme}`).toBe(
          String(expected.surfaceHue),
        );
        expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY), `${style} ${scheme}`).toBe(
          String(expected.accentHue),
        );
      }
    }

    // Each look reads its own suffixed key: a saved Vivid coordinate never follows
    // the reader into Clinical, and the flat pre-look key answers Vivid only.
    installMockStorage({
      [VISUAL_STYLE_STORAGE_KEY]: "pro",
      [`${SURFACE_CHROMA_STORAGE_KEY}-pro`]: "0.55",
      // The flat key is Vivid's legacy input; Clinical must not read it.
      [SURFACE_CHROMA_STORAGE_KEY]: "0.35",
    });
    ensureThemeMeta();
    document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();

    try {
      Function(buildThemeBootstrapScript(DOSEWIKI))();

      expect(document.documentElement.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe(
        "0.55",
      );

      // Light and dark SHARE the look's key: the mode flip never changes the reads.
      installMockStorage({
        [COLOR_SCHEME_STORAGE_KEY]: "light",
        [`${SURFACE_CHROMA_STORAGE_KEY}-fun`]: "0.4",
      });
      ensureThemeMeta();
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();

      Function(buildThemeBootstrapScript(DOSEWIKI))();

      expect(document.documentElement.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe(
        "0.4",
      );
    } finally {
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();
    }
  });

  it("migrates saved colourway ids onto the hue axes when no hue is saved", () => {
    installMockStorage({
      [SURFACE_STORAGE_KEY]: "abyss",
      [ACCENT_STORAGE_KEY]: "green",
      // A saved level survives migration to a chromatic colourway untouched.
      [ACCENT_CHROMA_STORAGE_KEY]: "0.8",
    });
    ensureThemeMeta();

    try {
      Function(buildThemeBootstrapScript(DOSEWIKI))();

      const root = document.documentElement;
      expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY)).toBe(
        `${LEGACY_SURFACE_TO_HUE.abyss.hue}`,
      );
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe(
        `${LEGACY_ACCENT_TO_HUE.green.hue}`,
      );
      expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe(
        String(DEFAULT_APPEARANCE_COLORS.fun.dark.surfaceLevel),
      );
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("0.8");
    } finally {
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();
    }
  });

  it("migrates the achromatic colourways to saturation 0, overriding a saved level", () => {
    // Graphite/Neutral were never hues: grey is chroma 0 now. A stored level must
    // not resurrect colour the reader had chosen away.
    installMockStorage({
      [SURFACE_STORAGE_KEY]: "graphite",
      [ACCENT_STORAGE_KEY]: "neutral",
      [SURFACE_CHROMA_STORAGE_KEY]: "0.6",
      [ACCENT_CHROMA_STORAGE_KEY]: "0.9",
    });
    ensureThemeMeta();

    try {
      Function(buildThemeBootstrapScript(DOSEWIKI))();

      const root = document.documentElement;
      expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe("0");
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("0");
      expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY)).toBe("0");
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("0");
    } finally {
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();
    }
  });

  it("retires the colourway attributes: the script removes both, whatever the server rendered", () => {
    installMockStorage({ [SURFACE_STORAGE_KEY]: "abyss", [ACCENT_STORAGE_KEY]: "green" });
    ensureThemeMeta();
    document.documentElement.dataset.surface = "abyss";
    document.documentElement.dataset.accent = "green";

    try {
      Function(buildThemeBootstrapScript(DOSEWIKI))();

      expect(document.documentElement.dataset.surface).toBeUndefined();
      expect(document.documentElement.dataset.accent).toBeUndefined();
    } finally {
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();
    }
  });

  it("does not read or apply colour preferences for a publication with both colour axes locked", () => {
    installMockStorage({
      [SURFACE_CHROMA_STORAGE_KEY]: "0.6",
      [ACCENT_CHROMA_STORAGE_KEY]: "0.9",
      [SURFACE_HUE_STORAGE_KEY]: "40",
      [ACCENT_HUE_STORAGE_KEY]: "300",
      [SURFACE_STORAGE_KEY]: "abyss",
      [ACCENT_STORAGE_KEY]: "green",
    });
    const getItem = vi.spyOn(window.localStorage, "getItem");
    ensureThemeMeta();

    Function(buildThemeBootstrapScript(EFFECT_INDEX))();

    expect(getItem.mock.calls.flat()).toEqual([COLOR_SCHEME_STORAGE_KEY]);
    const root = document.documentElement;
    expect(root.dataset.chroma).toBeUndefined();
    expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe("");
    expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("");
    expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY)).toBe("");
    expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("");
    expect(document.getElementById(CHROMA_STYLESHEET_LINK_ID)).toBeNull();
  });

  it("restores a saved face pre-paint, and treats anything else as the default", () => {
    installMockStorage({ [FONT_STORAGE_KEY]: "inter" });
    ensureThemeMeta();

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    expect(document.documentElement.dataset.font).toBe("inter");

    // The default is the ABSENCE of the attribute — the key either holds a paintable
    // face or the axis contributes nothing to the painted frame.
    delete document.documentElement.dataset.font;
    installMockStorage({ [FONT_STORAGE_KEY]: "papyrus" });

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    expect(document.documentElement.dataset.font).toBeUndefined();

    // The retired binary-toggle value paints the Lexend face it reproduced, rather than
    // decaying to the default: the dyslexia-friendly pick survives pre-paint.
    delete document.documentElement.dataset.font;
    installMockStorage({ [FONT_STORAGE_KEY]: "dyslexic" });

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    expect(document.documentElement.dataset.font).toBe("lexend");
  });

  it("restores the saved reading-type numbers pre-paint", () => {
    installMockStorage({
      [TEXT_SIZE_STORAGE_KEY]: "1.05",
      [LETTER_SPACING_STORAGE_KEY]: "-0.02",
      [LINE_HEIGHT_STORAGE_KEY]: "1.55",
    });
    ensureThemeMeta();

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    // The text-size axis is a unitless scale over the text tokens, not a root
    // font-size: it must never write `font-size`, which would reproduce zoom.
    expect(document.documentElement.style.getPropertyValue(TEXT_SIZE_PROPERTY)).toBe("1.05");
    expect(document.documentElement.style.fontSize).toBe("");
    // The written values carry their CSS units — a bare number would substitute
    // into letter-spacing as an invalid value and silently knock the
    // property back to its inherited value.
    expect(document.documentElement.style.getPropertyValue(READER_TRACKING_PROPERTY)).toBe("-0.02em");
    expect(document.documentElement).toHaveAttribute(READER_LEADING_ATTRIBUTE, "");
    expect(document.documentElement.style.getPropertyValue(READER_LEADING_PROPERTY)).toBe("1.55");
  });

  it("costs a saved value nothing when it falls outside its slider domain", () => {
    installMockStorage({
      [TEXT_SIZE_STORAGE_KEY]: "44",
      [LETTER_SPACING_STORAGE_KEY]: "2",
      [LINE_HEIGHT_STORAGE_KEY]: "9",
    });
    ensureThemeMeta();

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    expect(document.documentElement.style.getPropertyValue(TEXT_SIZE_PROPERTY)).toBe("");
    expect(document.documentElement.style.getPropertyValue(READER_TRACKING_PROPERTY)).toBe("");
    expect(document.documentElement).not.toHaveAttribute(READER_LEADING_ATTRIBUTE);
  });

  it("does not read or apply type preferences for a publication that locks the type axis", () => {
    installMockStorage({
      [FONT_STORAGE_KEY]: "inter",
      [TEXT_SIZE_STORAGE_KEY]: "1.05",
      [LETTER_SPACING_STORAGE_KEY]: "-0.02",
      [LINE_HEIGHT_STORAGE_KEY]: "1.55",
    });
    const getItem = vi.spyOn(window.localStorage, "getItem");
    ensureThemeMeta();

    Function(buildThemeBootstrapScript(EFFECT_INDEX))();

    expect(getItem.mock.calls.flat()).toEqual([COLOR_SCHEME_STORAGE_KEY]);
    const root = document.documentElement;
    expect(root.dataset.font).toBeUndefined();
    expect(root.style.getPropertyValue(TEXT_SIZE_PROPERTY)).toBe("");
    expect(root.style.getPropertyValue(READER_TRACKING_PROPERTY)).toBe("");
    expect(root).not.toHaveAttribute(READER_LEADING_ATTRIBUTE);
    expect(root.style.getPropertyValue(READER_LEADING_PROPERTY)).toBe("");
  });

  it("injects the appearance sheets a saved preference needs, ordered light → pro → chroma", () => {
    installMockStorage({
      [COLOR_SCHEME_STORAGE_KEY]: "light",
      [VISUAL_STYLE_STORAGE_KEY]: "pro",
    });
    ensureThemeMeta();

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    const light = document.getElementById(LIGHT_MODE_STYLESHEET_LINK_ID);
    const pro = document.getElementById(PRO_THEME_STYLESHEET_LINK_ID);
    const chroma = document.getElementById(CHROMA_STYLESHEET_LINK_ID);
    expect(light).toBeInstanceOf(HTMLLinkElement);
    expect(pro).toBeInstanceOf(HTMLLinkElement);
    expect((light as HTMLLinkElement).getAttribute("href")).toBe(LIGHT_MODE_STYLESHEET_HREF);
    expect((pro as HTMLLinkElement).getAttribute("href")).toBe(PRO_THEME_STYLESHEET_HREF);
    // The order is a cascade contract: pro-theme.css re-overrides equal-specificity
    // light-mode rules by source order, and the chroma sheet re-tints tokens both seed.
    const links = [...document.head.querySelectorAll("link")];
    expect(links.indexOf(light as HTMLLinkElement)).toBeLessThan(
      links.indexOf(pro as HTMLLinkElement),
    );
    expect(links.indexOf(pro as HTMLLinkElement)).toBeLessThan(
      links.indexOf(chroma as HTMLLinkElement),
    );
  });

  it("injects no appearance sheet for the default fun+dark reader", () => {
    installMockStorage();
    ensureThemeMeta();

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    // The whole point of moving the sheets out of the bundle: the default
    // reader downloads neither.
    expect(document.getElementById(LIGHT_MODE_STYLESHEET_LINK_ID)).toBeNull();
    expect(document.getElementById(PRO_THEME_STYLESHEET_LINK_ID)).toBeNull();
  });

  it("reuses a server-rendered sheet link instead of duplicating it", () => {
    installMockStorage({ [VISUAL_STYLE_STORAGE_KEY]: "pro" });
    ensureThemeMeta();
    const rendered = document.createElement("link");
    rendered.id = PRO_THEME_STYLESHEET_LINK_ID;
    rendered.rel = "stylesheet";
    rendered.href = PRO_THEME_STYLESHEET_HREF;
    document.head.appendChild(rendered);

    Function(buildThemeBootstrapScript(DOSEWIKI))();

    expect(document.querySelectorAll(`#${PRO_THEME_STYLESHEET_LINK_ID}`)).toHaveLength(1);
  });

  it("injects no appearance sheet for a publication whose defaults are server-rendered", () => {
    installMockStorage();
    ensureThemeMeta();

    Function(buildThemeBootstrapScript(EFFECT_INDEX))();

    expect(document.getElementById(LIGHT_MODE_STYLESHEET_LINK_ID)).toBeNull();
    expect(document.getElementById(PRO_THEME_STYLESHEET_LINK_ID)).toBeNull();
  });

  it("lands both root attributes even when the meta lookup throws", () => {
    installMockStorage({ [COLOR_SCHEME_STORAGE_KEY]: "dark" });
    const meta = ensureThemeMeta();
    const getElementById = vi.spyOn(document, "getElementById").mockImplementation(() => {
      throw new Error("meta lookup blocked");
    });

    try {
      Function(buildThemeBootstrapScript(EFFECT_INDEX))();
    } finally {
      getElementById.mockRestore();
    }

    // A broken chrome tint costs the reader their tint, never their appearance.
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.visualStyle).toBe("pro");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(meta.content).toBe("");
  });
});
