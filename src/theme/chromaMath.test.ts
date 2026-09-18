import { describe, expect, it } from "vitest";
import {
  atLevel,
  authoredLevel,
  isChromaticLiteral,
  maxChroma,
  proAccentRepresentativeSeed,
  toOklch,
} from "./chromaMath";

describe("chroma maths", () => {
  it("round-trips a colour through its own authored level", () => {
    // Re-seating a colour's chroma at the level it already sits on must give
    // the colour back (within hex rounding): this is the identity the whole
    // axis rests on — no saved preference, no visible change.
    for (const hex of ["#f0abfc", "#1f0527", "#22d3ee", "#fdc38f", "#0e7490"]) {
      const roundTripped = atLevel(hex, authoredLevel(hex));
      const original = toOklch(hex)!;
      const back = toOklch(roundTripped)!;
      expect(Math.abs(back.l - original.l), hex).toBeLessThan(0.01);
      expect(Math.abs(back.c - original.c), hex).toBeLessThan(0.01);
    }
  });

  it("changes chroma only: lightness and hue survive any level", () => {
    const original = toOklch("#f0abfc")!;
    for (const level of [0, 0.25, 0.5, 0.75, 1]) {
      const moved = toOklch(atLevel("#f0abfc", level))!;
      expect(Math.abs(moved.l - original.l)).toBeLessThan(0.01);
      if (moved.c > 0.02) {
        // Hue is meaningless near the achromatic axis, so only compare where
        // there is chroma to carry it.
        expect(Math.abs(moved.h - original.h)).toBeLessThan(3);
      }
    }
  });

  it("passes achromatic literals through untouched at every level", () => {
    for (const grey of ["#ffffff", "#000000", "#777777"]) {
      expect(atLevel(grey, 0)).toBe(grey);
      expect(atLevel(grey, 1)).toBe(grey);
      expect(isChromaticLiteral(grey)).toBe(false);
    }
    // Graphite's old panel #16181d measures C ≈ 0.008 — above the literal
    // threshold. That non-zero whisper is why grey lives as saturation level 0
    // on the chroma axis rather than as a threshold-detected special case.
    expect(isChromaticLiteral("#16181d")).toBe(true);
    expect(isChromaticLiteral("#f0abfc")).toBe(true);
    expect(isChromaticLiteral("rgb(165 243 252)")).toBe(true);
    expect(isChromaticLiteral("rgb(255 255 255)")).toBe(false);
  });

  it("keeps every level inside the sRGB gamut, including level 1", () => {
    // maxChroma is found by bisection against the gamut boundary; atLevel(x, 1)
    // must therefore parse back to a valid colour, not clip channels.
    for (const hex of ["#f0abfc", "#bbf7d0", "#2d1130"]) {
      const maxed = atLevel(hex, 1);
      expect(maxed).toMatch(/^#[0-9a-f]{6}$/);
      const { l, c, h } = toOklch(maxed)!;
      expect(c).toBeLessThanOrEqual(maxChroma(l, h) + 0.01);
    }
  });

  it("picks --ei-accent as the Pro ramp's representative seed, null when undeclared", () => {
    // The CSS gain denominator and the slider rail read this one pick, so the
    // level the slider calls "authored" is the level where the Pro block's
    // gain resolves to 1.
    const pro = {
      dark: { "--ei-accent": "#22aabb", "--ei-accent-strong": "#115566" },
      light: { "--ei-accent-strong": "#115566" },
    };
    expect(proAccentRepresentativeSeed(pro, "dark")).toBe("#22aabb");
    expect(proAccentRepresentativeSeed(pro, "light")).toBeNull();
  });

  it("reads levels the prototype validated: the shipped swatches' own positions", () => {
    // Anchors from the approved prototype: Default accent ~94%, Green ~66%.
    // These are data statements about the shipped palette, so a palette edit
    // that moves them should be a conscious change here too.
    expect(Math.round(authoredLevel("#f0abfc") * 100)).toBe(94);
    expect(Math.round(authoredLevel("#bbf7d0") * 100)).toBe(66);
  });
});
