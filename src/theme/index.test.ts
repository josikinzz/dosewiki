import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import {
  APPEARANCE_META_COLORS,
  COLOR_SCHEME_STORAGE_KEY,
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
    expect(getInitialAppearance(DOSEWIKI)).toEqual({ colorScheme: "dark", visualStyle: "fun" });
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
