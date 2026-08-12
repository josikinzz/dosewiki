import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPaletteLabBootstrapScript } from "./paletteLabBootstrap";
import {
  PALETTE_ATTRIBUTE,
  PALETTE_LAB_OVERRIDE_STYLE_ID,
  PALETTE_LAB_STORAGE_KEY,
  buildOverrideCss,
} from "./paletteLabStorage";
import { presetBlockSelector } from "./presetStylesheet";

/**
 * The pre-paint bootstrap, tested the way the dark/light theme bootstrap is:
 * as a *build artifact* (a string that must not churn between deploys, because
 * its hash is pinned in the CSP) and as *behavior* (executed against a seeded
 * DOM, asserting only on the document state a first paint would read).
 */

function installMockStorage(value?: string) {
  const store = new Map<string, string>();
  if (value !== undefined) store.set(PALETTE_LAB_STORAGE_KEY, value);
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, next: string) => store.set(key, String(next)),
    },
  });
}

/** Run the script exactly as the browser would: from source, in the document. */
function runBootstrap() {
  Function(buildPaletteLabBootstrapScript())();
}

function injectedCss() {
  return document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.textContent ?? null;
}

function palette() {
  return document.documentElement.getAttribute(PALETTE_ATTRIBUTE);
}

beforeEach(() => {
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.documentElement.setAttribute("data-theme", "dark");
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
});

afterEach(() => {
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID)?.remove();
});

describe("palette lab bootstrap artifact", () => {
  it("is byte-identical across builds, so its CSP hash never churns", () => {
    expect(buildPaletteLabBootstrapScript()).toBe(buildPaletteLabBootstrapScript());
  });

  it("carries no preset data, so shipping a new palette cannot change its bytes", () => {
    const script = buildPaletteLabBootstrapScript();

    expect(script).not.toContain("abyss");
    expect(script).not.toContain("--theme-panel-base");
    expect(script).toContain(PALETTE_LAB_STORAGE_KEY);
  });
});

describe("palette lab bootstrap behavior", () => {
  it("does nothing at all for a visitor with no saved theme", () => {
    installMockStorage();

    runBootstrap();

    expect(palette()).toBeNull();
    expect(injectedCss()).toBeNull();
  });

  it("survives unreadable storage without disturbing the document", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("storage blocked");
        },
      },
    });

    expect(() => runBootstrap()).not.toThrow();
    expect(palette()).toBeNull();
    expect(injectedCss()).toBeNull();
  });

  it("wears a preset with no edits by naming it alone — no CSS to inject", () => {
    installMockStorage(
      JSON.stringify({
        version: 3,
        activeThemeRef: { kind: "preset", id: "abyss" },
        editsByPreset: {},
        customThemes: [],
        shareFormat: 1,
      }),
    );

    runBootstrap();

    // The palette itself is already in the stylesheet under this exact selector.
    expect(palette()).toBe("abyss");
    expect(presetBlockSelector("abyss", "dark")).toBe(
      'html[data-palette="abyss"][data-theme="dark"]',
    );
    expect(injectedCss()).toBeNull();
  });

  it("injects an edits-only visitor's tokens with no palette named", () => {
    installMockStorage(
      JSON.stringify({
        version: 3,
        activeThemeRef: { kind: "preset", id: "orchid" },
        editsByPreset: { orchid: { dark: { "--theme-accent": "#0ff0ff" }, light: {} } },
        customThemes: [],
        shareFormat: 1,
      }),
    );

    runBootstrap();

    expect(palette()).toBe("orchid");
    expect(injectedCss()).toBe(
      'html[data-theme="dark"][data-theme],html[data-theme="light"][data-theme] .theme-chrome-dark{--theme-accent:#0ff0ff;}',
    );
  });

  it("emits exactly the CSS the runtime would, so hydration changes nothing", () => {
    const overrides = {
      dark: { "--theme-accent": "#0ff0ff" },
      light: { "--theme-accent": "#006677" },
    };
    installMockStorage(
      JSON.stringify({
        version: 3,
        activeThemeRef: { kind: "preset", id: "abyss" },
        editsByPreset: { abyss: overrides },
        customThemes: [],
        shareFormat: 1,
      }),
    );

    runBootstrap();

    expect(palette()).toBe("abyss");
    expect(injectedCss()).toBe(buildOverrideCss(overrides));
  });

  it("emits user rules at the same specificity as the preset blocks they must beat", () => {
    installMockStorage(
      JSON.stringify({
        version: 3,
        activeThemeRef: { kind: "preset", id: "abyss" },
        editsByPreset: { abyss: { dark: { "--theme-panel-base": "#abcdef" }, light: {} } },
        customThemes: [],
        shareFormat: 1,
      }),
    );
    // Both blocks are two attributes on one type selector, so the later one —
    // this injected element, appended after the stylesheet — wins the token.
    const style = document.createElement("style");
    style.textContent = `${presetBlockSelector("abyss", "dark")}{--theme-panel-base:#07202e;}`;
    document.head.appendChild(style);

    try {
      runBootstrap();

      expect(getComputedStyle(document.documentElement).getPropertyValue("--theme-panel-base").trim()).toBe(
        "#abcdef",
      );
    } finally {
      style.remove();
    }
  });

  it("wears a custom slot as its base palette plus the slot's own tokens", () => {
    installMockStorage(
      JSON.stringify({
        version: 3,
        activeThemeRef: { kind: "custom", id: "slot-1" },
        editsByPreset: { "custom:slot-1": { dark: { "--theme-accent": "#111111" }, light: {} } },
        customThemes: [
          {
            id: "slot-1",
            name: "Mine",
            basePresetId: "twilight",
            overrides: {
              dark: { "--theme-accent": "#999999", "--theme-panel-base": "#222222" },
              light: {},
            },
          },
        ],
        shareFormat: 1,
      }),
    );

    runBootstrap();

    expect(palette()).toBe("twilight");
    // The slot's tokens ride in the injected layer; the edit wins over the slot.
    expect(injectedCss()).toContain("--theme-panel-base:#222222;");
    expect(injectedCss()).toContain("--theme-accent:#111111;");
    expect(injectedCss()).not.toContain("#999999");
  });

  it("restores a v2 envelope's preset and its single edit map", () => {
    installMockStorage(
      JSON.stringify({
        version: 2,
        presetId: "abyss",
        overrides: { dark: { "--theme-accent": "#0ff0ff" }, light: {} },
      }),
    );

    runBootstrap();

    expect(palette()).toBe("abyss");
    expect(injectedCss()).toContain("--theme-accent:#0ff0ff;");
  });

  it("restores a legacy v1 blob as edits on the stock look", () => {
    installMockStorage(JSON.stringify({ dark: { "--theme-accent": "#123456" }, light: {} }));

    runBootstrap();

    expect(palette()).toBeNull();
    expect(injectedCss()).toContain("--theme-accent:#123456;");
  });

  it("keeps a retired preset id, which simply matches no compiled block", () => {
    installMockStorage(
      JSON.stringify({
        version: 3,
        activeThemeRef: { kind: "preset", id: "retired-preset" },
        editsByPreset: {
          "retired-preset": { dark: { "--theme-accent": "#123456" }, light: {} },
        },
        customThemes: [],
        shareFormat: 1,
      }),
    );

    runBootstrap();

    expect(palette()).toBe("retired-preset");
    expect(injectedCss()).toContain("--theme-accent:#123456;");
  });

  it("ignores junk, non-token keys, and non-string values in a tampered envelope", () => {
    installMockStorage(
      JSON.stringify({
        version: 3,
        activeThemeRef: { kind: "preset", id: "orchid" },
        editsByPreset: {
          orchid: {
            dark: {
              "--theme-accent": "#0ff0ff",
              "--theme-evil": { nested: true },
              "background: red": "#000",
            },
            light: {},
          },
        },
        customThemes: [],
        shareFormat: 1,
      }),
    );

    runBootstrap();

    expect(injectedCss()).toBe(
      'html[data-theme="dark"][data-theme],html[data-theme="light"][data-theme] .theme-chrome-dark{--theme-accent:#0ff0ff;}',
    );
  });

  it("leaves the document alone when storage holds something unparseable", () => {
    installMockStorage("not json at all");

    expect(() => runBootstrap()).not.toThrow();
    expect(palette()).toBeNull();
    expect(injectedCss()).toBeNull();
  });
});
