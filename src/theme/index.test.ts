import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import {
  APPEARANCE_META_COLORS,
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
  DEFAULT_COLOR_SCHEME,
  DEFAULT_VISUAL_STYLE,
  LEGACY_ACCENT_TO_HUE,
  LEGACY_SURFACE_TO_HUE,
  SUPPORTED_COLOR_SCHEMES,
  SUPPORTED_VISUAL_STYLES,
  THEME_META_ID,
  THEME_TOKEN_INTERFACE,
  VISUAL_STYLE_STORAGE_KEY,
  buildThemeBootstrapScript,
  getAppearanceMetaColor,
  getInitialAppearance,
  isColorScheme,
  isVisualStyle,
} from "./index";
import {
  ACCENT_HUE_PROPERTY,
  ACCENT_LEVEL_PROPERTY,
  CHROMA_STYLESHEET_HREF,
  CHROMA_STYLESHEET_LINK_ID,
  DEFAULT_ACCENT_HUE,
  DEFAULT_ACCENT_LEVEL,
  DEFAULT_PRO_SURFACE_LEVEL,
  DEFAULT_SURFACE_HUE,
  DEFAULT_SURFACE_LEVEL,
  SURFACE_HUE_PROPERTY,
  SURFACE_LEVEL_PROPERTY,
  applyChromaToDocument,
  parseHueDegrees,
} from "./appearanceChroma";
import {
  DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS,
  REVIEWED_THEME_TOKEN_AUDIT_BASELINE,
  THEME_TOKEN_AUDIT_BASELINE,
  auditThemeTokenFilesAgainstBaseline,
  auditThemeTokenFiles,
  auditThemeTokenText,
  findNewThemeTokenFindings,
} from "./tokenAudit";

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
  });

  it("names both appearance axes, their storage keys, and the meta-colour matrix", () => {
    expect(THEME_TOKEN_INTERFACE.name).toBe("dosewiki-theme-token-interface");
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

    expect(isColorScheme("light")).toBe(true);
    expect(isColorScheme("sepia")).toBe(false);
    expect(isVisualStyle("fun")).toBe(true);
    expect(isVisualStyle("pro")).toBe(true);
    // The axes are not interchangeable: a scheme value is not a style value.
    expect(isVisualStyle("dark")).toBe(false);
    expect(isColorScheme("pro")).toBe(false);

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

  it("exposes semantic classes and Tailwind aliases from the manifest", () => {
    expect(THEME_TOKEN_INTERFACE.semanticClasses.text).toContain("theme-text-secondary");
    expect(THEME_TOKEN_INTERFACE.semanticClasses.text).toContain("theme-public-overline");
    expect(THEME_TOKEN_INTERFACE.semanticClasses.text).toContain("theme-evidence-accent");
    expect(THEME_TOKEN_INTERFACE.semanticClasses.surface).toContain("theme-public-card");
    expect(THEME_TOKEN_INTERFACE.semanticClasses.surface).toEqual(
      expect.arrayContaining([
        "theme-badge-surface",
        "theme-evidence-surface",
        "theme-evidence-badge",
        "theme-public-section-rule",
        "theme-public-skeleton-surface",
      ]),
    );
    expect(THEME_TOKEN_INTERFACE.semanticClasses.interactive).toEqual(
      expect.arrayContaining([
        "theme-control-pill",
        "theme-control-pill-quiet",
        "theme-citation-marker",
        "theme-evidence-link",
      ]),
    );
    expect(THEME_TOKEN_INTERFACE.semanticClasses.icon).toEqual(
      expect.arrayContaining(["theme-icon-accent", "theme-icon-muted", "theme-icon-badge"]),
    );
    expect(THEME_TOKEN_INTERFACE.semanticClasses.typography).toEqual(
      expect.arrayContaining([
        "type-meta-label",
        "type-control-label",
        "type-chip-label",
        "type-kicker",
      ]),
    );
    expect(THEME_TOKEN_INTERFACE.tailwindAliases.dose["text-secondary"]).toBe(
      "var(--theme-text-secondary)",
    );
    expect(THEME_TOKEN_INTERFACE.tailwindAliases.dose.evidence).toBe(
      "var(--theme-evidence-text)",
    );
    expect(THEME_TOKEN_INTERFACE.cssVariables.evidence).toEqual(
      expect.arrayContaining([
        "--theme-evidence-bg",
        "--theme-evidence-border",
        "--theme-evidence-text",
        "--theme-evidence-ring",
      ]),
    );
    expect(THEME_TOKEN_INTERFACE.cssVariables.editor).toEqual(
      expect.arrayContaining([
        "--editor-panel-bg",
        "--editor-field-bg",
        "--editor-code-bg",
        "--editor-chip-bg",
      ]),
    );
    expect(THEME_TOKEN_INTERFACE.cssVariables.typography).toContain("--type-tracking-body");
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
    const script = buildThemeBootstrapScript(EFFECT_INDEX);

    Function(script)();

    // The saved Fun choice is not read and then overridden: the key is not in the script.
    expect(script).not.toContain(VISUAL_STYLE_STORAGE_KEY);
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

  it("engages the site defaults for a reader with nothing saved, and for garbage values", () => {
    // "" and "1.5" and "abc" must all resolve to the default level: Number("") is 0,
    // which would otherwise silently pin a level the reader never chose. The hue
    // grammar is stricter — an integer degree count in 0..359 — so "1.5", "-20",
    // "360" and "40px" all fall back to the authored hue.
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
        String(DEFAULT_SURFACE_LEVEL),
      );
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY), String(garbage)).toBe(
        String(DEFAULT_ACCENT_LEVEL),
      );
      expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY), String(garbage)).toBe(
        `${DEFAULT_SURFACE_HUE}`,
      );
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY), String(garbage)).toBe(
        `${DEFAULT_ACCENT_HUE}`,
      );
      const link = document.getElementById(CHROMA_STYLESHEET_LINK_ID);
      expect(link, String(garbage)).toBeInstanceOf(HTMLLinkElement);
      expect((link as HTMLLinkElement).getAttribute("href")).toBe(CHROMA_STYLESHEET_HREF);
    }
  });

  it("resolves the surface-level default from the style it just painted: Pro rests at 0", () => {
    // The Pro surface blocks are additive (c + K × level), so level 0 IS the
    // authored charcoal — Pro's own resting look — while Fun rests on the
    // softened Orchid tint. One stored decimal still drives both styles; only
    // the default is per style, picked from the style the script resolved.
    for (const [style, expected] of [
      ["pro", DEFAULT_PRO_SURFACE_LEVEL],
      ["fun", DEFAULT_SURFACE_LEVEL],
    ] as const) {
      installMockStorage({ [VISUAL_STYLE_STORAGE_KEY]: style });
      ensureThemeMeta();
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();

      Function(buildThemeBootstrapScript(DOSEWIKI))();

      const root = document.documentElement;
      expect(root.dataset.visualStyle, style).toBe(style);
      expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY), style).toBe(String(expected));
      // The accent default is style-independent.
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY), style).toBe(
        String(DEFAULT_ACCENT_LEVEL),
      );
    }

    // A saved decimal keeps meaning one knob for both styles: it wins over
    // the per-style default on Pro exactly as it does on Fun.
    installMockStorage({
      [VISUAL_STYLE_STORAGE_KEY]: "pro",
      [SURFACE_CHROMA_STORAGE_KEY]: "0.35",
    });
    ensureThemeMeta();
    document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();

    try {
      Function(buildThemeBootstrapScript(DOSEWIKI))();

      expect(document.documentElement.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe(
        "0.35",
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
        String(DEFAULT_SURFACE_LEVEL),
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

  it("emits no colour-axis machinery for a publication with both colour axes locked", () => {
    const script = buildThemeBootstrapScript(EFFECT_INDEX);

    expect(script).not.toContain("chroma");
    expect(script).not.toContain("hue");
    expect(script).not.toContain(SURFACE_CHROMA_STORAGE_KEY);
    expect(script).not.toContain(ACCENT_CHROMA_STORAGE_KEY);
    expect(script).not.toContain(SURFACE_HUE_STORAGE_KEY);
    expect(script).not.toContain(ACCENT_HUE_STORAGE_KEY);
    // The migration inputs are dose.wiki history; a locked script never reads them.
    expect(script).not.toContain(SURFACE_STORAGE_KEY);
    expect(script).not.toContain(ACCENT_STORAGE_KEY);
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

describe("colour axis runtime helpers", () => {
  it("reads a stored hue as an integer degree count in 0..359, null otherwise", () => {
    // The provider and the bootstrap must agree on this grammar; the bootstrap
    // inlines it, and the garbage cases above assert the inlined copy.
    expect(parseHueDegrees("0")).toBe(0);
    expect(parseHueDegrees("40")).toBe(40);
    expect(parseHueDegrees("359")).toBe(359);
    expect(parseHueDegrees("007")).toBe(7);
    for (const garbage of [null, "", "360", "-20", "1.5", "40px", "abc"]) {
      expect(parseHueDegrees(garbage), String(garbage)).toBeNull();
    }
  });

  it("writes and clears hue properties alongside the levels, disengaging only when all four are locked", () => {
    const root = document.documentElement;
    document.head.innerHTML = "";

    try {
      applyChromaToDocument(0.35, 1, 40, 300);
      expect(root.dataset.chroma).toBe("");
      expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe("0.35");
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("1");
      expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY)).toBe("40");
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("300");
      expect(document.getElementById(CHROMA_STYLESHEET_LINK_ID)).toBeInstanceOf(HTMLLinkElement);

      // One locked axis clears its own properties and leaves the other engaged.
      applyChromaToDocument(null, 0.8, null, 120);
      expect(root.dataset.chroma).toBe("");
      expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe("");
      expect(root.style.getPropertyValue(SURFACE_HUE_PROPERTY)).toBe("");
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("0.8");
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("120");

      // All four locked (Effect Index): the axes disengage entirely.
      applyChromaToDocument(null, null, null, null);
      expect(root.dataset.chroma).toBeUndefined();
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("");
      expect(root.style.getPropertyValue(ACCENT_HUE_PROPERTY)).toBe("");
    } finally {
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();
      delete root.dataset.chroma;
      root.style.removeProperty(SURFACE_LEVEL_PROPERTY);
      root.style.removeProperty(ACCENT_LEVEL_PROPERTY);
      root.style.removeProperty(SURFACE_HUE_PROPERTY);
      root.style.removeProperty(ACCENT_HUE_PROPERTY);
    }
  });
});

describe("theme token audit", () => {
  it("scans public routes, route-owned page components, and feature presentation by default", () => {
    expect(DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS).toEqual([
      "src/app",
      "src/components/common",
      "src/components/layout",
      "src/components/pages",
      "src/components/ui",
      "src/features",
    ]);
  });

  it("reports raw shared UI styling escapes without enforcing a clean repo yet", () => {
    const findings = auditThemeTokenText(
      [
        `className="text-white/70 border-white/10 bg-white/5 text-fuchsia-300 bg-white/[0.045]"`,
        `style={{ color: "var(--theme-text-primary)" }}`,
        `.label { letter-spacing: -0.01em; }`,
      ].join("\n"),
      "src/components/ui/example.tsx",
    );

    expect(findings.map((finding) => finding.rule)).toEqual([
      "raw-white-text",
      "raw-white-background",
      "raw-white-border",
      "raw-fuchsia-text",
      "raw-white-arbitrary-background",
      "direct-theme-variable",
      "negative-letter-spacing",
    ]);
  });

  it("allows token implementation files to use raw variables", () => {
    const findings = auditThemeTokenText(
      `.theme-text-secondary { color: var(--theme-text-secondary); }`,
      "src/styles/utilities-theme.css",
    );

    expect(findings).toEqual([]);
  });

  it("can scan the shared UI surface in report mode", () => {
    const findings = auditThemeTokenFiles(["src/components/ui/button.tsx"]);

    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
  });

  it("can fail only on findings absent from a reviewed baseline", () => {
    const source = `className="text-white/70 text-fuchsia-300"`;
    const [grandfatheredFinding, newFinding] = auditThemeTokenText(
      source,
      "src/features/example/Panel.tsx",
    );

    expect(
      findNewThemeTokenFindings([grandfatheredFinding, newFinding], [grandfatheredFinding]),
    ).toEqual([newFinding]);
  });

  it("loads a reviewed baseline for existing token audit findings", () => {
    expect(THEME_TOKEN_AUDIT_BASELINE.schemaVersion).toBe(1);
    expect(THEME_TOKEN_AUDIT_BASELINE.reviewScope).toBe(
      "production push shared public UI token audit review",
    );
    expect(THEME_TOKEN_AUDIT_BASELINE.scanRoots).toEqual(DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS);
    expect(REVIEWED_THEME_TOKEN_AUDIT_BASELINE.length).toBeGreaterThan(0);
    expect(
      findNewThemeTokenFindings(
        REVIEWED_THEME_TOKEN_AUDIT_BASELINE,
        REVIEWED_THEME_TOKEN_AUDIT_BASELINE,
      ),
    ).toEqual([]);
  });

  it("treats the reviewed baseline as the current migration gate", () => {
    const report = auditThemeTokenFilesAgainstBaseline();

    expect(report.reviewedBaseline).toBe(REVIEWED_THEME_TOKEN_AUDIT_BASELINE);
    expect(report.newFindings).toEqual([]);
  });
});
