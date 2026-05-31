import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  SUPPORTED_THEMES,
  THEME_META_COLORS,
  THEME_META_ID,
  THEME_STORAGE_KEY,
  THEME_TOKEN_INTERFACE,
  buildThemeBootstrapScript,
  getThemeMetaColor,
  isThemeName,
} from "./index";
import {
  DEFAULT_THEME_TOKEN_AUDIT_SCAN_ROOTS,
  auditThemeTokenFiles,
  auditThemeTokenText,
  findNewThemeTokenFindings,
} from "./tokenAudit";

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
    expect(THEME_TOKEN_INTERFACE.semanticClasses.surface).toContain("theme-public-card");
    expect(THEME_TOKEN_INTERFACE.tailwindAliases.dose["text-secondary"]).toBe(
      "var(--theme-text-secondary)",
    );
    expect(THEME_TOKEN_INTERFACE.cssVariables.typography).toContain("--type-tracking-body");
  });

  it("builds a bootstrap script from shared constants", () => {
    installMockStorage("light");
    const meta = ensureThemeMeta();

    Function(buildThemeBootstrapScript())();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(meta.content).toBe(THEME_META_COLORS.light);
  });

  it("falls back to the default theme for unsupported stored values", () => {
    installMockStorage("sepia");
    const meta = ensureThemeMeta();

    Function(buildThemeBootstrapScript())();

    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);
    expect(document.documentElement.style.colorScheme).toBe(DEFAULT_THEME);
    expect(meta.content).toBe(THEME_META_COLORS.dark);
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
});
