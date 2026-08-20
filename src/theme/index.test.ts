import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import {
  APPEARANCE_META_COLORS,
  ACCENT_CHROMA_STORAGE_KEY,
  BASE_ACCENT,
  COLOR_SCHEME_STORAGE_KEY,
  SURFACE_CHROMA_STORAGE_KEY,
  DEFAULT_COLOR_SCHEME,
  DEFAULT_VISUAL_STYLE,
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
  ACCENT_LEVEL_PROPERTY,
  CHROMA_STYLESHEET_HREF,
  CHROMA_STYLESHEET_LINK_ID,
  DEFAULT_ACCENT_LEVEL,
  DEFAULT_SURFACE_LEVEL,
  SURFACE_LEVEL_PROPERTY,
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
    // The dose.wiki script engages the saturation axis on every run now, so each
    // test starts from a document that carries none of it.
    delete document.documentElement.dataset.chroma;
    document.documentElement.style.removeProperty(SURFACE_LEVEL_PROPERTY);
    document.documentElement.style.removeProperty(ACCENT_LEVEL_PROPERTY);
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
    // The chroma keys avoid "dosewiki-accent"/"dosewiki-surface" as prefixes on
    // purpose: the locked-flavor tests assert those substrings are absent from
    // the Effect Index script byte-for-byte.
    expect(SURFACE_CHROMA_STORAGE_KEY).toBe("dosewiki-chroma-surface");
    expect(ACCENT_CHROMA_STORAGE_KEY).toBe("dosewiki-chroma-accent");

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
    // dose.wiki opens on the authored Orchid/Default base now — softened by the site-default
    // saturation levels the bootstrap paints, not by an off-base colourway. Effect Index locks
    // the axis, and a lock resolves to BASE_ACCENT no matter what the policy declares —
    // asserted here against a policy that declares the same thing, and again below against one
    // that does not.
    expect(getInitialAppearance(DOSEWIKI)).toEqual({
      colorScheme: "dark",
      visualStyle: "fun",
      surface: "orchid",
      accent: "default",
    });
    expect(getInitialAppearance(EFFECT_INDEX)).toEqual({
      colorScheme: "light",
      visualStyle: "pro",
      surface: "orchid",
      accent: BASE_ACCENT,
    });
    // A lock outranks the declared opening accent: the axis wears the publication's identity.
    expect(
      getInitialAppearance({ ...EFFECT_INDEX, defaultAccent: "teal", showAccentPicker: false })
        .accent,
    ).toBe(BASE_ACCENT);
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

  it("engages a saved saturation level before paint: attribute, level, stylesheet link", () => {
    installMockStorage({
      [SURFACE_CHROMA_STORAGE_KEY]: "0.35",
      [ACCENT_CHROMA_STORAGE_KEY]: "1",
    });
    ensureThemeMeta();

    try {
      Function(buildThemeBootstrapScript(DOSEWIKI))();

      const root = document.documentElement;
      expect(root.dataset.chroma).toBe("");
      expect(root.style.getPropertyValue(SURFACE_LEVEL_PROPERTY)).toBe("0.35");
      expect(root.style.getPropertyValue(ACCENT_LEVEL_PROPERTY)).toBe("1");
      const link = document.getElementById(CHROMA_STYLESHEET_LINK_ID);
      expect(link).toBeInstanceOf(HTMLLinkElement);
      expect((link as HTMLLinkElement).getAttribute("href")).toBe(CHROMA_STYLESHEET_HREF);
    } finally {
      document.getElementById(CHROMA_STYLESHEET_LINK_ID)?.remove();
      document.documentElement.style.removeProperty(SURFACE_LEVEL_PROPERTY);
      document.documentElement.style.removeProperty(ACCENT_LEVEL_PROPERTY);
      delete document.documentElement.dataset.chroma;
    }
  });

  it("engages the site-default levels for a reader with no saved level, and for garbage levels", () => {
    // "" and "1.5" and "abc" must all resolve to the defaults: Number("") is 0,
    // which would otherwise silently pin a level the reader never chose.
    for (const garbage of [null, "", "1.5", "-0.2", "abc"]) {
      installMockStorage(
        garbage === null
          ? {}
          : { [SURFACE_CHROMA_STORAGE_KEY]: garbage, [ACCENT_CHROMA_STORAGE_KEY]: garbage },
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
      const link = document.getElementById(CHROMA_STYLESHEET_LINK_ID);
      expect(link, String(garbage)).toBeInstanceOf(HTMLLinkElement);
      expect((link as HTMLLinkElement).getAttribute("href")).toBe(CHROMA_STYLESHEET_HREF);
    }
  });

  it("emits no chroma machinery for a publication with both colour axes locked", () => {
    const script = buildThemeBootstrapScript(EFFECT_INDEX);

    expect(script).not.toContain("chroma");
    expect(script).not.toContain(SURFACE_CHROMA_STORAGE_KEY);
    expect(script).not.toContain(ACCENT_CHROMA_STORAGE_KEY);
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
