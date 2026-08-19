#!/usr/bin/env bun
/**
 * Compiles the Fun halves of the surface and accent axes into literal token maps.
 *
 * Both axes wear the same colourway definitions from `palettePresets.ts` — a surface IS one, and an
 * accent names one through `funPresetId` — so the colourway is handed to the resolver as a map
 * rather than resolved out of a stylesheet. `resolveBasePaletteTokens` then lays it over
 * `site-colors.css` and substitutes every `var()`, which is what turns a hue seed into the literal
 * the generated CSS can ship without the reader's browser having to resolve a chain.
 *
 * `paletteTokenRole` is what keeps the two axes from claiming the same tokens: a surface writes only
 * the surface family, an accent only the accent family.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";

import { getPreset } from "../../src/features/theme-lab/palettePresets";
import { ACCENTS } from "../../src/theme/accents";
import { paletteTokenRole } from "../../src/theme/paletteOwnership";
import { SURFACES } from "../../src/theme/surfaces";
import { resolveBasePaletteTokens } from "../../src/test/fixtures/accentAppearanceGrid";

const themes = ["dark", "light"] as const;
const surfaceData = Object.fromEntries(
  SURFACES.map((surface) => [
    surface.id,
    Object.fromEntries(
      themes.map((theme) => {
        const tokens = resolveBasePaletteTokens(
          { visualStyle: "fun", theme },
          surface.overrides[theme] ?? {},
        );
        return [theme, Object.fromEntries(Object.entries(tokens).filter(([id]) => paletteTokenRole(id) === "surface"))];
      }),
    ),
  ]),
);
const accentData = Object.fromEntries(
  ACCENTS.map((accent) => [
    accent.id,
    Object.fromEntries(
      themes.map((theme) => {
        const colourway = accent.funPresetId ? getPreset(accent.funPresetId).overrides[theme] ?? {} : {};
        const tokens = resolveBasePaletteTokens({ visualStyle: "fun", theme }, colourway);
        if (accent.id === "green" && theme === "light") {
          tokens["--theme-section-heading"] = "#10783a";
        }
        return [
          theme,
          Object.fromEntries(
            Object.entries(tokens).filter(([id]) => paletteTokenRole(id) === "accent"),
          ),
        ];
      }),
    ),
  ]),
);
for (const [file, data] of [
  ["src/theme/surfaceFunTokens.generated.json", surfaceData],
  ["src/theme/accentFunTokens.generated.json", accentData],
] as const) {
  writeFileSync(resolve(cwd(), file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  stdout.write(`Wrote ${file}.\n`);
}
