import { describe, expect, it } from "vitest";

import {
  SCHEMES,
  STYLES,
  composite,
  contrastRatio,
  deltaEok,
  parseColor,
  parseColorWithAlpha,
  resolveTokens,
} from "@/test/fixtures/accentAppearanceGrid";
import { ACCENTS, BASE_ACCENT_ID } from "./accents";
import { paletteTokenRole } from "./paletteOwnership";
import { SURFACE_STYLESHEET_PATH, buildSurfaceStylesheetCss } from "./surfaceStylesheet";
import { BASE_SURFACE_ID, SURFACES } from "./surfaces";
import { readFileSync } from "node:fs";

const points = STYLES.flatMap((visualStyle) =>
  SCHEMES.flatMap((theme) =>
    SURFACES.flatMap((surface) =>
      ACCENTS.map((accent) => ({
        visualStyle,
        theme,
        surface,
        accent,
        tokens: resolveTokens({
          visualStyle,
          theme,
          ...(surface.id === BASE_SURFACE_ID ? {} : { surface: surface.id }),
          ...(accent.id === BASE_ACCENT_ID ? {} : { accent: accent.id }),
        }),
      })),
    ),
  ),
);

const SURFACE_SAMPLE = [
  "--theme-body-bg",
  "--theme-surface-soft",
  "--theme-surface-strong",
  "--theme-field-surface",
  "--theme-border-strong",
  "--theme-text-primary",
  "--theme-text-secondary",
  "--theme-success-bg",
  "--theme-success-text",
  "--theme-warning-bg",
  "--theme-warning-text",
  "--theme-danger-bg",
  "--theme-danger-text",
  "--theme-evidence-bg",
  "--theme-evidence-text",
] as const;
const ACCENT_SAMPLE = [
  "--theme-accent",
  "--theme-accent-strong",
  "--theme-section-heading",
  "--theme-logo-fill",
  "--theme-selected-control-text",
  "--theme-selected-control-border",
  "--theme-selected-control-focus",
  "--theme-inline-reference-text",
  "--theme-inline-reference-hover-text",
  "--theme-inline-reference-focus",
] as const;

function pick(tokens: Record<string, string>, names: readonly string[]) {
  return Object.fromEntries(names.map((name) => [name, tokens[name]]));
}

describe("independent surface and accent axes", () => {
  it("covers all 196 supported appearances", () => {
    expect(points).toHaveLength(196);
    for (const point of points) {
      expect(point.tokens["--theme-body-bg"]).toBeTruthy();
      expect(point.tokens["--theme-accent"]).toBeTruthy();
    }
  });

  it("keeps sampled surface outputs byte-identical while accent changes", () => {
    for (const style of STYLES) for (const theme of SCHEMES) for (const surface of SURFACES) {
      const row = points.filter(
        (point) => point.visualStyle === style && point.theme === theme && point.surface.id === surface.id,
      );
      const baseline = pick(row[0]!.tokens, SURFACE_SAMPLE);
      for (const point of row) expect(pick(point.tokens, SURFACE_SAMPLE)).toEqual(baseline);
    }
  });

  it("keeps sampled accent outputs byte-identical while surfaces change", () => {
    for (const style of STYLES) for (const theme of SCHEMES) for (const accent of ACCENTS) {
      const row = points.filter(
        (point) => point.visualStyle === style && point.theme === theme && point.accent.id === accent.id,
      );
      const baseline = pick(row[0]!.tokens, ACCENT_SAMPLE);
      for (const point of row) expect(pick(point.tokens, ACCENT_SAMPLE)).toEqual(baseline);
    }
  });

  it("gives every Accent a distinct selected-control hue", () => {
    for (const style of STYLES) for (const theme of SCHEMES) for (const surface of SURFACES) {
      const row = points.filter(
        (point) =>
          point.visualStyle === style &&
          point.theme === theme &&
          point.surface.id === surface.id,
      );
      for (const token of [
        "--theme-selected-control-text",
        "--theme-selected-control-border",
        "--theme-selected-control-focus",
        "--theme-inline-reference-text",
        "--theme-inline-reference-hover-text",
        "--theme-inline-reference-focus",
      ]) {
        expect(
          new Set(row.map((point) => point.tokens[token])).size,
          `${style}/${theme}/${surface.id}: ${token} did not follow every Accent`,
        ).toBe(ACCENTS.length);
      }
    }
  });

  it("keeps text and accent readable across the complete matrix", () => {
    const pairs = [
      ["--theme-text-primary", "--theme-body-bg"],
      ["--theme-text-secondary", "--theme-surface-soft"],
      ["--theme-accent", "--theme-body-bg"],
      ["--theme-accent", "--theme-surface-strong"],
      ["--theme-selected-control-text", "--theme-selected-control-base"],
    ] as const;
    for (const point of points) for (const [ink, ground] of pairs) {
      expect(
        contrastRatio(parseColor(point.tokens[ink]), parseColor(point.tokens[ground])),
        `${point.visualStyle}/${point.theme}/${point.surface.id}/${point.accent.id}: ${ink} on ${ground}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps inline references readable across the complete matrix", () => {
    for (const point of points) {
      const body = parseColor(point.tokens["--theme-body-bg"]);
      const referenceBg = composite(
        parseColorWithAlpha(point.tokens["--theme-inline-reference-bg"]),
        body,
      );
      expect(
        contrastRatio(parseColor(point.tokens["--theme-inline-reference-text"]), referenceBg),
        `${point.visualStyle}/${point.theme}/${point.surface.id}/${point.accent.id}: inline reference`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps safety categories perceptually separate from the accent", () => {
    const semantic = ["--theme-success-text", "--theme-warning-text", "--theme-danger-text"];
    for (const point of points) {
      const accent = parseColor(point.tokens["--theme-accent"]);
      for (const token of semantic) {
        expect(deltaEok(accent, parseColor(point.tokens[token]))).toBeGreaterThanOrEqual(0.02);
      }
    }
  });

  it("emits only surface-owned Fun declarations", () => {
    const css = readFileSync(SURFACE_STYLESHEET_PATH, "utf8");
    expect(css).toBe(buildSurfaceStylesheetCss());
    for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      if (match[1].startsWith("--ei-")) continue;
      expect(paletteTokenRole(match[1])).toBe("surface");
    }
  });
});
