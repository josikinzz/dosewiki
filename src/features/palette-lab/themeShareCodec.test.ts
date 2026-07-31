import { describe, expect, it } from "vitest";
import { getPreset } from "./palettePresets";
import { ALL_TOKEN_IDS } from "./paletteTokens";
import {
  MAX_SHARE_CODE_LENGTH,
  THEME_SHARE_CODEC_VERSION,
  decodeSharedTheme,
  encodeSharedTheme,
  shareCodeFits,
} from "./themeShareCodec";

/**
 * The share codec's own contract, asserted on what a recipient ends up holding:
 * the whole look, or a refusal with a reason. Everything hostile is checked at
 * the boundary a stranger's link actually crosses.
 */

/** Hand-mint a code the way an attacker would: any payload, base64url'd. */
function mint(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("theme share codec", () => {
  it("round-trips the whole look, including the palette it started from", () => {
    const code = encodeSharedTheme({
      name: "Midnight",
      basePresetId: "abyss",
      overrides: {
        dark: { ...getPreset("abyss").overrides.dark, "--theme-accent": "#abcdef" },
        light: { ...getPreset("abyss").overrides.light },
      },
    });

    const { value, error } = decodeSharedTheme(code);
    expect(error).toBeNull();
    expect(value.name).toBe("Midnight");
    expect(value.basePresetId).toBe("abyss");
    expect(value.unknownBase).toBe(false);
    // Self-contained on the way out: the base palette is back in the map, with
    // the shared divergence on top.
    expect(value.overrides.dark["--theme-accent"]).toBe("#abcdef");
    for (const [id, presetValue] of Object.entries(getPreset("abyss").overrides.dark)) {
      if (id === "--theme-accent") continue;
      expect(value.overrides.dark[id]).toBe(presetValue);
    }
  });

  it("stays compact by not restating the palette it names", () => {
    const abyss = getPreset("abyss");
    const code = encodeSharedTheme({
      name: "Midnight",
      basePresetId: "abyss",
      overrides: {
        dark: { ...abyss.overrides.dark, "--theme-accent": "#abcdef" },
        light: { ...abyss.overrides.light },
      },
    });
    // Abyss alone is ~4.4kB of JSON; a code describing it plus one tweak is a
    // couple of hundred characters, which is what makes a link shareable.
    expect(code.length).toBeLessThan(300);
    expect(code.length).toBeLessThan(MAX_SHARE_CODE_LENGTH);
    // URL-safe with no escaping needed.
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(code)).toBe(code);
  });

  it("reproduces a look built on the stock palette", () => {
    const code = encodeSharedTheme({
      name: "Mine",
      basePresetId: "orchid",
      overrides: { dark: { "--theme-accent": "#0f0f0f" }, light: { "--theme-accent": "#ffffff" } },
    });
    const { value } = decodeSharedTheme(code);
    expect(value.overrides).toEqual({
      dark: { "--theme-accent": "#0f0f0f" },
      light: { "--theme-accent": "#ffffff" },
    });
    expect(value.tokenCount).toBe(2);
  });

  it("applies a look built on a palette this build no longer ships", () => {
    const code = mint({
      v: THEME_SHARE_CODEC_VERSION,
      n: "From the future",
      b: "retired-palette",
      d: { "~accent": "#123456" },
      l: {},
    });
    const { value, error } = decodeSharedTheme(code);
    expect(error).toBeNull();
    expect(value.unknownBase).toBe(true);
    // Falls back to the stock palette rather than refusing the whole theme.
    expect(value.basePresetId).toBe("orchid");
    expect(value.overrides.dark["--theme-accent"]).toBe("#123456");
  });

  it("ignores fields it does not know, so a later codec can add them", () => {
    const code = mint({
      v: THEME_SHARE_CODEC_VERSION,
      n: "Forward",
      b: "orchid",
      d: { "~accent": "#123456" },
      l: {},
      // Anything a future revision might carry alongside the essentials.
      meta: { author: "someone", notes: ["hello"] },
      shareFormat: 9,
    });
    const { value, error } = decodeSharedTheme(code);
    expect(error).toBeNull();
    expect(value.overrides.dark["--theme-accent"]).toBe("#123456");
  });

  it("refuses a code from a newer codec instead of half-applying it", () => {
    const code = mint({ v: THEME_SHARE_CODEC_VERSION + 1, n: "Next", b: "orchid", d: {}, l: {} });
    const { value, error } = decodeSharedTheme(code);
    expect(value).toBeNull();
    expect(error).toMatch(/newer Theme Lab/i);
  });

  it("refuses an oversize payload before decoding it", () => {
    const { value, error } = decodeSharedTheme("A".repeat(MAX_SHARE_CODE_LENGTH + 1));
    expect(value).toBeNull();
    expect(error).toMatch(/too large/i);
  });

  it("refuses a payload naming anything outside the token registry", () => {
    const code = mint({
      v: THEME_SHARE_CODEC_VERSION,
      n: "Hostile",
      b: "orchid",
      d: { "--not-a-theme-token": "red", "~accent": "#123456" },
      l: {},
    });
    const { value, error } = decodeSharedTheme(code);
    expect(value).toBeNull();
    expect(error).toMatch(/isn’t a Theme Lab color/i);
  });

  it.each([
    ["a declaration break", "red;position:fixed"],
    ["a block escape", "red}html{display:none"],
    ["a comment escape", "red/*"],
    ["a remote asset", "url(https://evil.example/x.png)"],
    ["markup", "<script>alert(1)</script>"],
  ])("refuses %s in a value", (_label, hostile) => {
    const code = mint({
      v: THEME_SHARE_CODEC_VERSION,
      n: "Hostile",
      b: "orchid",
      d: { "~accent": hostile },
      l: {},
    });
    const { value, error } = decodeSharedTheme(code);
    expect(value).toBeNull();
    expect(error).toMatch(/won’t apply|can’t read/i);
  });

  it("still accepts the values the palette legitimately uses", () => {
    const gradient = getPreset("abyss").overrides.dark["--theme-scroll-thumb-bg"];
    expect(gradient).toBeTruthy();
    const code = encodeSharedTheme({
      name: "Gradients",
      basePresetId: "orchid",
      overrides: { dark: { "--theme-scroll-thumb-bg": gradient }, light: {} },
    });
    const { value, error } = decodeSharedTheme(code);
    expect(error).toBeNull();
    expect(value.overrides.dark["--theme-scroll-thumb-bg"]).toBe(gradient);
  });

  it("refuses junk that is not a share code at all", () => {
    for (const junk of ["", "   ", "not a code!!", mint("just a string"), mint([1, 2, 3])]) {
      expect(decodeSharedTheme(junk).value).toBeNull();
      expect(decodeSharedTheme(junk).error).toBeTruthy();
    }
  });

  it("drops tokens the registry does not know when encoding, rather than shipping them", () => {
    const code = encodeSharedTheme({
      name: "Mine",
      basePresetId: "orchid",
      overrides: { dark: { "--theme-accent": "#123456", "--rogue-token": "red" }, light: {} },
    });
    const { value, error } = decodeSharedTheme(code);
    expect(error).toBeNull();
    expect(value.overrides.dark["--rogue-token"]).toBeUndefined();
    expect(value.overrides.dark["--theme-accent"]).toBe("#123456");
  });

  it("carries a heavily hand-tuned theme inside the cap", () => {
    // Sixty tweaked tokens is far past what the panel's Essentials view even
    // exposes, and it still fits a link.
    const overrides = { dark: {} as Record<string, string>, light: {} };
    for (const id of ALL_TOKEN_IDS.slice(0, 60)) overrides.dark[id] = "#010203";
    const code = encodeSharedTheme({ name: "Everything", basePresetId: "orchid", overrides });
    expect(shareCodeFits(code)).toBe(true);
    const { value, error } = decodeSharedTheme(code);
    expect(error).toBeNull();
    expect(value.tokenCount).toBe(60);
  });

  it("reports a theme too big to link instead of minting a doomed URL", () => {
    const overrides = { dark: {} as Record<string, string>, light: {} as Record<string, string> };
    for (const id of ALL_TOKEN_IDS) {
      overrides.dark[id] = "#010203";
      overrides.light[id] = "#040506";
    }
    const code = encodeSharedTheme({ name: "Too much", basePresetId: "orchid", overrides });
    expect(shareCodeFits(code)).toBe(false);
    // And the receiving end would refuse it too, rather than truncating.
    expect(decodeSharedTheme(code).value).toBeNull();
  });
});
