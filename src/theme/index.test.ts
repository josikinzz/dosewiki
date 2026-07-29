import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import {
  DEFAULT_THEME,
  SUPPORTED_THEMES,
  THEME_META_COLORS,
  THEME_META_ID,
  THEME_STORAGE_KEY,
  THEME_TOKEN_INTERFACE,
  buildThemeBootstrapScript,
  getInitialTheme,
  getThemeMetaColor,
  getThemeMetaColors,
  isThemeName,
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

function installMockStorage(value?: string) {
  const store = new Map<string, string>();

  if (value) {
    store.set(THEME_STORAGE_KEY, value);
  }

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

/** The reader-chooses bootstrap, built for the unlocked flavor rather than the ambient one. */
function buildUnlockedBootstrapScript() {
  return buildThemeBootstrapScript({
    lockedTheme: DOSEWIKI.lockedTheme,
    metaColors: getThemeMetaColors(DOSEWIKI),
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
    document.documentElement.style.colorScheme = "";
  });

  it("names the supported runtime themes and meta colors", () => {
    expect(THEME_TOKEN_INTERFACE.name).toBe("dosewiki-theme-token-interface");
    expect(SUPPORTED_THEMES).toEqual(["dark", "light"]);
    expect(DEFAULT_THEME).toBe("dark");
    expect(THEME_STORAGE_KEY).toBe("dosewiki-theme");
    expect(getThemeMetaColor("dark")).toBe(THEME_META_COLORS.dark);
    expect(isThemeName("light")).toBe(true);
    expect(isThemeName("sepia")).toBe(false);
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

  it("builds a bootstrap script from shared constants", () => {
    installMockStorage("light");
    const meta = ensureThemeMeta();

    // Named the unlocked flavor explicitly: this case is about the reader-chooses path,
    // which the ambient flavor may not be. No process.env mutation, just an argument.
    Function(buildUnlockedBootstrapScript())();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(meta.content).toBe(THEME_META_COLORS.light);
  });

  it("falls back to the default theme for unsupported stored values", () => {
    installMockStorage("sepia");
    const meta = ensureThemeMeta();

    Function(buildUnlockedBootstrapScript())();

    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);
    expect(document.documentElement.style.colorScheme).toBe(DEFAULT_THEME);
    expect(meta.content).toBe(THEME_META_COLORS.dark);
  });

  it("falls back to the default theme when the unlocked path throws", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("storage blocked");
        },
      },
    });
    ensureThemeMeta();

    Function(buildThemeBootstrapScript({ lockedTheme: null }))();

    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);
    expect(document.documentElement.style.colorScheme).toBe(DEFAULT_THEME);
  });

  it("tints a locked flavor's pinned theme with its manifest colour", () => {
    // dose.wiki lets readers choose, so its map is the shared one, unchanged.
    expect(getThemeMetaColors(DOSEWIKI)).toBe(THEME_META_COLORS);
    expect(getInitialTheme(DOSEWIKI)).toBe(DEFAULT_THEME);

    expect(getThemeMetaColors(EFFECT_INDEX)).toEqual({
      dark: THEME_META_COLORS.dark,
      light: EFFECT_INDEX.manifest.themeColor,
    });
    expect(getThemeMetaColor("light", EFFECT_INDEX)).toBe(EFFECT_INDEX.manifest.themeColor);
    expect(getThemeMetaColor("light", EFFECT_INDEX)).not.toBe(THEME_META_COLORS.light);
    expect(getInitialTheme(EFFECT_INDEX)).toBe(EFFECT_INDEX.lockedTheme);
  });

  it("applies a locked theme without consulting the stored preference", () => {
    installMockStorage("dark");
    const getItem = vi.spyOn(window.localStorage, "getItem");
    const meta = ensureThemeMeta();
    const script = buildThemeBootstrapScript({
      lockedTheme: "light",
      metaColors: getThemeMetaColors(EFFECT_INDEX),
    });

    Function(script)();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(meta.content).toBe(EFFECT_INDEX.manifest.themeColor);
    // Skipped entirely, not read and then overridden.
    expect(getItem).not.toHaveBeenCalled();
    expect(script).not.toContain(THEME_STORAGE_KEY);
  });

  it("still applies the locked theme when the locked path throws", () => {
    installMockStorage("dark");
    const meta = ensureThemeMeta();
    const getElementById = vi.spyOn(document, "getElementById").mockImplementation(() => {
      throw new Error("meta lookup blocked");
    });

    try {
      Function(
        buildThemeBootstrapScript({
          lockedTheme: "light",
          metaColors: getThemeMetaColors(EFFECT_INDEX),
        }),
      )();
    } finally {
      getElementById.mockRestore();
    }

    // The shared catch must not fall back to DEFAULT_THEME ("dark") on a light-locked site.
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
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
