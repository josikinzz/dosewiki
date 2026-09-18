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
 *
 * The surface family also gets a fallback map: the same resolution with `site-colors.css`'s
 * `@supports`-guarded relative-colour recipes dropped, kept only where it differs. The
 * generated surface sheet re-declares those tokens at (0,2,1), above the authored blocks, so
 * it has to carry the literal-then-recipe shape itself or it would hand Safari 16.x an
 * invalid value the authored fallback could no longer rescue. The accent sheet emits only the
 * Pro `--ei-*` seeds, which are literals already, so it needs none.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";

import { BASE_ACCENT_ID } from "../../src/theme/accents";
import { paletteTokenRole } from "../../src/theme/paletteOwnership";
import { BASE_SURFACE_ID } from "../../src/theme/surfaces";
import {
  resolveBasePaletteFallbackTokens,
  resolveBasePaletteTokens,
} from "../../src/test/fixtures/accentAppearanceGrid";

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

function surfaceFallbacks() {
  return Object.fromEntries(
    themes.map((theme) => {
      const recipes = resolveBasePaletteTokens({ visualStyle: "fun", theme });
      const fallbacks = resolveBasePaletteFallbackTokens({ visualStyle: "fun", theme });
      return [
        theme,
        Object.fromEntries(
          Object.entries(fallbacks).filter(
            ([id, value]) => paletteTokenRole(id) === "surface" && recipes[id] !== value,
          ),
        ),
      ];
    }),
  );
}

const surfaceData = { [BASE_SURFACE_ID]: baseTokens("surface") };
const surfaceFallbackData = { [BASE_SURFACE_ID]: surfaceFallbacks() };
const accentData = { [BASE_ACCENT_ID]: baseTokens("accent") };

for (const [file, data] of [
  ["src/theme/surfaceFunTokens.generated.json", surfaceData],
  ["src/theme/surfaceFunTokenFallbacks.generated.json", surfaceFallbackData],
  ["src/theme/accentFunTokens.generated.json", accentData],
] as const) {
  writeFileSync(resolve(cwd(), file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  stdout.write(`Wrote ${file}.\n`);
}
