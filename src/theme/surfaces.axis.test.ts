import { describe, expect, it } from "vitest";

import { getPreset } from "@/features/theme-lab/palettePresets";
import {
  GRID,
  SCHEMES,
  composite,
  contrastRatio,
  deltaEok,
  parseColor,
  parseColorWithAlpha,
  read,
} from "@/test/fixtures/accentAppearanceGrid";
import { paletteTokenRole } from "./paletteOwnership";
import {
  SURFACE_STYLESHEET_PATH,
  buildSurfaceStylesheetCss,
  surfaceBaseBlockSelector,
} from "./surfaceStylesheet";
import { LEGACY_SURFACE_TO_HUE, isSurface } from "./surfaces";
import { readFileSync } from "node:fs";

/**
 * The base surface: the one authored colourway left, and the migration table that carries the
 * retired ones onto the hue/chroma axes. The hue-rotation runtime itself is covered in
 * `chromaStylesheet.test.ts` and the bootstrap migration in `index.test.ts`.
 */

/* -------------------------------------------------------------------------
 * The migration table.
 * ---------------------------------------------------------------------- */

describe("legacy surface migration", () => {
  it("keeps exactly the seven retired ids as vocabulary, in the settled order", () => {
    expect(Object.keys(LEGACY_SURFACE_TO_HUE)).toEqual([
      "orchid",
      "abyss",
      "canopy",
      "garnet",
      "sunset",
      "graphite",
      "lagoon",
    ]);
    for (const id of Object.keys(LEGACY_SURFACE_TO_HUE)) expect(isSurface(id)).toBe(true);
    // A colour scheme, a visual style and a retired accent id are the values most likely to
    // arrive by mistake from a mis-keyed storage read. None is a surface id.
    expect(isSurface("dark")).toBe(false);
    expect(isSurface("pro")).toBe(false);
    expect(isSurface("blue")).toBe(false);
    expect(isSurface(null)).toBe(false);
  });

  it("maps every retired chromatic surface to its authored hue delta", () => {
    // The base brand hue, read off the sheet rather than restated.
    const baseMatch = /--h-brand:\s*(\d+)\s*;/.exec(read("src/styles/site-colors.css"));
    expect(baseMatch, "site-colors.css no longer declares --h-brand").not.toBeNull();
    const base = Number(baseMatch![1]);

    // Each retired surface WAS a colourway, and its authored `--h-brand` is the hue the reader
    // actually saw. The migration hue is that angle minus the base's, normalised — asserted
    // against the authored seeds (which live on as the Theme Lab's preset payloads) so the
    // frozen table cannot silently disagree with what shipped.
    for (const id of ["abyss", "canopy", "garnet", "sunset", "lagoon"] as const) {
      const authored = Number(getPreset(id).overrides.dark["--h-brand"]);
      expect(Number.isFinite(authored), `${id} authors no --h-brand`).toBe(true);

      const expected = (((authored - base) % 360) + 360) % 360;
      const entry = LEGACY_SURFACE_TO_HUE[id];

      expect(entry.hue, `${id}: expected ${authored} − ${base} mod 360`).toBe(expected);
      // A chromatic colourway is a rotation, never a grey: a zero shift here would migrate a
      // saved reader onto the base plum.
      expect(entry.hue).toBeGreaterThan(0);
      expect(Number.isInteger(entry.hue)).toBe(true);
      expect(entry.hue).toBeLessThan(360);
      expect(entry.chroma).toBeUndefined();
    }
  });

  it("maps the base and the achromatic surface onto the axes' own vocabulary", () => {
    expect(LEGACY_SURFACE_TO_HUE.orchid).toEqual({ hue: 0 });
    // Graphite was never a hue — it pinned the palette's chroma near zero — so its heir is
    // saturation level 0. The chroma pin overrides a stored chroma level during migration; a
    // hue rotation of grey would answer nothing.
    expect(LEGACY_SURFACE_TO_HUE.graphite).toEqual({ hue: 0, chroma: 0 });
  });
});

/* -------------------------------------------------------------------------
 * The generated stylesheet.
 * ---------------------------------------------------------------------- */

describe("surface stylesheet generation", () => {
  it("matches the checked-in stylesheet", () => {
    expect(readFileSync(SURFACE_STYLESHEET_PATH, "utf8")).toBe(buildSurfaceStylesheetCss());
  });

  it("emits only the base blocks, at the rank the cascade ladder pins", () => {
    const css = buildSurfaceStylesheetCss();

    // The base block, verbatim: keyed on the retired attribute's ABSENCE with a BARE :not(),
    // so it keeps the (0,2,1) the cascade was balanced around — it has to re-seat the authored
    // (0,1,1) light block below it, and it ties pro-theme.css's palette blocks, which is why
    // it also carries the zero-specificity :where() Pro guard. Wrapped in :where() the :not()
    // would drop the block to (0,1,1) and a reader would see the authored palette instead.
    for (const theme of SCHEMES) {
      expect(surfaceBaseBlockSelector(theme)).toBe(
        `html:not([data-surface])[data-theme="${theme}"]:where(:not([data-visual-style="pro"]))`,
      );
      expect(css).toContain(surfaceBaseBlockSelector(theme));
    }

    // The named surfaces are retired: no value selector, and no Pro re-tint blocks — the base
    // surface under Pro is pro-theme.css as authored.
    expect(css).not.toContain('data-surface="');
    expect(css).not.toContain("--ei-");
  });

  it("emits only surface-owned declarations", () => {
    for (const match of buildSurfaceStylesheetCss().matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      expect(paletteTokenRole(match[1]), match[1]).toBe("surface");
    }
  });
});

/* -------------------------------------------------------------------------
 * Readability floors on the base palette.
 * ---------------------------------------------------------------------- */

describe("base palette readability", () => {
  it.each(GRID)("keeps text and accent readable on $label", ({ label, tokens }) => {
    const pairs = [
      ["--theme-text-primary", "--theme-body-bg"],
      ["--theme-text-secondary", "--theme-surface-soft"],
      ["--theme-accent", "--theme-body-bg"],
      ["--theme-accent", "--theme-surface-strong"],
      ["--theme-selected-control-text", "--theme-selected-control-base"],
    ] as const;
    for (const [ink, ground] of pairs) {
      expect(
        contrastRatio(parseColor(tokens[ink]), parseColor(tokens[ground])),
        `${label}: ${ink} on ${ground}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(GRID)("keeps inline references readable on $label", ({ label, tokens }) => {
    const body = parseColor(tokens["--theme-body-bg"]);
    const referenceBg = composite(parseColorWithAlpha(tokens["--theme-inline-reference-bg"]), body);
    expect(
      contrastRatio(parseColor(tokens["--theme-inline-reference-text"]), referenceBg),
      `${label}: inline reference`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRID)("keeps safety categories perceptually separate from the accent on $label", ({ tokens }) => {
    const accent = parseColor(tokens["--theme-accent"]);
    for (const token of ["--theme-success-text", "--theme-warning-text", "--theme-danger-text"]) {
      expect(deltaEok(accent, parseColor(tokens[token]))).toBeGreaterThanOrEqual(0.02);
    }
  });
});
