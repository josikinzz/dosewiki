#!/usr/bin/env bun
/**
 * Compiles the base colourway's Fun tokens into literal token maps.
 *
 * The named surface/accent colourways are retired, so only the base (Orchid / Default) look is
 * compiled: `resolveBasePaletteTokens` lays an empty override map over `site-colors.css` and
 * substitutes every `var()`, which is what turns the authored hue seeds into the literals the
 * generated CSS can ship without the reader's browser having to resolve a chain. The chroma
 * stylesheet then rewrites those literals with the saturation gain and hue rotation.
 *
 * `paletteTokenRole` is what keeps the two axes from claiming the same tokens: the surface map
 * carries only the surface family, the accent map only the accent family.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";

import { BASE_ACCENT_ID } from "../../src/theme/accents";
import { paletteTokenRole } from "../../src/theme/paletteOwnership";
import { BASE_SURFACE_ID } from "../../src/theme/surfaces";
import { resolveBasePaletteTokens } from "../../src/test/fixtures/accentAppearanceGrid";

const themes = ["dark", "light"] as const;

function baseTokens(role: "surface" | "accent") {
  return Object.fromEntries(
    themes.map((theme) => {
      const tokens = resolveBasePaletteTokens({ visualStyle: "fun", theme });
      return [
        theme,
        Object.fromEntries(Object.entries(tokens).filter(([id]) => paletteTokenRole(id) === role)),
      ];
    }),
  );
}

const surfaceData = { [BASE_SURFACE_ID]: baseTokens("surface") };
const accentData = { [BASE_ACCENT_ID]: baseTokens("accent") };

for (const [file, data] of [
  ["src/theme/surfaceFunTokens.generated.json", surfaceData],
  ["src/theme/accentFunTokens.generated.json", accentData],
] as const) {
  writeFileSync(resolve(cwd(), file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  stdout.write(`Wrote ${file}.\n`);
}
