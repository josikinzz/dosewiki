import { describe, expect, it } from "vitest";
import { ALL_TOKEN_IDS } from "./paletteTokens";
import {
  DEFAULT_PRESET_ID,
  PALETTE_PRESETS,
  PRESET_HUE_TOKEN_IDS,
  getPreset,
  isKnownPresetId,
  mergeOverrides,
} from "./palettePresets";

const KNOWN_IDS = new Set<string>([...ALL_TOKEN_IDS, ...PRESET_HUE_TOKEN_IDS]);
const THEMES = ["dark", "light"] as const;

describe("palettePresets definitions", () => {
  it("has unique ids and the default preset first with zero overrides", () => {
    const ids = PALETTE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(DEFAULT_PRESET_ID);
    const fallback = getPreset(DEFAULT_PRESET_ID);
    expect(Object.keys(fallback.overrides.dark)).toHaveLength(0);
    expect(Object.keys(fallback.overrides.light)).toHaveLength(0);
  });

  it("only overrides registry tokens or whitelisted hue seeds", () => {
    for (const preset of PALETTE_PRESETS) {
      for (const themeName of THEMES) {
        for (const tokenId of Object.keys(preset.overrides[themeName])) {
          expect(KNOWN_IDS.has(tokenId), `${preset.id}/${themeName}: unknown token ${tokenId}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("carries both themes with non-empty values in every non-default preset", () => {
    for (const preset of PALETTE_PRESETS) {
      for (const themeName of THEMES) {
        const map = preset.overrides[themeName];
        expect(map, `${preset.id} is missing the ${themeName} map`).toBeTruthy();
        if (preset.id !== DEFAULT_PRESET_ID) {
          expect(
            Object.keys(map).length,
            `${preset.id}/${themeName} should restyle this theme`,
          ).toBeGreaterThan(0);
        }
        for (const [tokenId, value] of Object.entries(map)) {
          expect(value.trim(), `${preset.id}/${themeName}/${tokenId} is empty`).not.toBe("");
        }
      }
    }
  });

  it("re-seats the brand seeds and pins the light logo stop in every alternate look", () => {
    for (const preset of PALETTE_PRESETS) {
      if (preset.id === DEFAULT_PRESET_ID) continue;
      expect(preset.overrides.dark["--c-brand"]).toBeTruthy();
      expect(preset.overrides.light["--c-brand"]).toBeTruthy();
      expect(preset.overrides.dark["--c-accent"]).toBeTruthy();
      // Light logo stop 3 is a hard-coded literal in site-colors.css, so every
      // alternate palette must pin it or ship a stray purple wordmark stop.
      expect(preset.overrides.light["--site-logo-stop-3"]).toBeTruthy();
    }
  });

  it("ships five swatch hexes per theme for the picker strips", () => {
    for (const preset of PALETTE_PRESETS) {
      for (const themeName of THEMES) {
        const strip = preset.swatch[themeName];
        expect(strip, `${preset.id}/${themeName} swatch strip`).toHaveLength(5);
        for (const hex of strip) {
          expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it("merges with user edits winning per token, per theme", () => {
    const base = {
      dark: { "--a": "base-dark-a", "--b": "base-dark-b" },
      light: { "--a": "base-light-a" },
    };
    const user = { dark: { "--b": "user-dark-b" }, light: { "--c": "user-light-c" } };
    const merged = mergeOverrides(base, user);
    expect(merged.dark).toEqual({ "--a": "base-dark-a", "--b": "user-dark-b" });
    expect(merged.light).toEqual({ "--a": "base-light-a", "--c": "user-light-c" });
    // Inputs are not mutated.
    expect(base.dark["--b"]).toBe("base-dark-b");
    expect(user.dark).toEqual({ "--b": "user-dark-b" });
  });

  it("degrades unknown preset ids to the default", () => {
    expect(isKnownPresetId("abyss")).toBe(true);
    expect(isKnownPresetId("not-a-preset")).toBe(false);
    expect(isKnownPresetId(null)).toBe(false);
    expect(getPreset("not-a-preset").id).toBe(DEFAULT_PRESET_ID);
    expect(getPreset(undefined).id).toBe(DEFAULT_PRESET_ID);
    expect(getPreset("sunset").id).toBe("sunset");
  });
});
