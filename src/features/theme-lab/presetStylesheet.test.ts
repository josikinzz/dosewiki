// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE_PRESETS } from "./palettePresets";
import {
  PRESET_STYLESHEET_PATH,
  buildPresetStylesheetCss,
  presetBlockSelector,
} from "./presetStylesheet";

/**
 * The compiled presets are what makes a saved palette paint before any script
 * runs, so the checked-in stylesheet has to keep agreeing with the preset
 * definitions it was generated from — otherwise a visitor wears a palette the
 * lab no longer thinks it shipped.
 */

const checkedIn = readFileSync(resolve(process.cwd(), PRESET_STYLESHEET_PATH), "utf8");

describe("generated preset stylesheet", () => {
  it("matches the presets it is generated from", () => {
    expect(checkedIn, "run: npm run generate:palette-css").toBe(buildPresetStylesheetCss());
  });

  it("is deterministic, so regenerating an unchanged preset set is a no-op diff", () => {
    expect(buildPresetStylesheetCss()).toBe(buildPresetStylesheetCss());
  });

  it("emits every non-empty preset under its own palette attribute value", () => {
    for (const preset of PALETTE_PRESETS) {
      for (const [theme, tokens] of Object.entries(preset.overrides)) {
        const selector = presetBlockSelector(preset.id, theme);
        if (Object.keys(tokens).length === 0) {
          expect(checkedIn, `${preset.id}/${theme}`).not.toContain(`${selector} {`);
          expect(checkedIn, `${preset.id}/${theme}`).not.toContain(`${selector},`);
          continue;
        }
        // A dark block heads a two-selector list, so it opens with the comma
        // that the light chrome island closes.
        const opener = theme === "dark" ? `${selector},` : `${selector} {`;
        expect(checkedIn, `${preset.id}/${theme}`).toContain(opener);
      }
    }
  });

  it("hands a preset's dark palette to the dark chrome island on a light page", () => {
    for (const preset of PALETTE_PRESETS) {
      if (Object.keys(preset.overrides.dark ?? {}).length === 0) continue;
      const dark = presetBlockSelector(preset.id, "dark");
      const island = `${presetBlockSelector(preset.id, "light")} .theme-chrome-dark`;
      expect(checkedIn, preset.id).toContain(`${dark},\n${island} {`);
    }
  });

  it("scopes every rule to the palette attribute, so it is inert until one is worn", () => {
    const selectors = checkedIn
      .split("\n")
      .filter((line) => line.endsWith("{") || line.endsWith(","))
      .map((line) => line.replace(/[,{]$/, "").trim());

    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toMatch(
        /^html\[data-palette="[a-z-]+"\]\[data-theme="(dark|light)"\](?: \.theme-chrome-dark)?$/,
      );
    }
  });

  it("carries the shipped default look as authored CSS rather than as a block", () => {
    // Orchid *is* the stock stylesheet, so it has nothing to compile — which is
    // also why an unknown saved id renders the same thing it does.
    expect(checkedIn).not.toContain('html[data-palette="orchid"]');
  });
});
