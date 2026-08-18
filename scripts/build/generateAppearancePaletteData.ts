#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";

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
        const tokens = resolveBasePaletteTokens({
          visualStyle: "fun",
          theme,
          ...(surface.id === "orchid" ? {} : { palette: surface.id }),
        });
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
        const tokens = resolveBasePaletteTokens({
          visualStyle: "fun",
          theme,
          ...(accent.funPresetId ? { palette: accent.funPresetId } : {}),
        });
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
