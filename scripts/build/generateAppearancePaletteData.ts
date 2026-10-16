#!/usr/bin/env bun

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
