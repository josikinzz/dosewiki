import { describe, expect, it } from "vitest";

import { slugify as scriptSlugify } from "./slug.mjs";
import { slugify as canonicalSlugify } from "../../src/utils/slug";

const FIXTURES = [
  "LSD",
  "Psilocybin Mushrooms",
  "2C-B",
  "5-MeO-DMT",
  "GHB/GBL",
  "Alpha,beta -- gamma",
  "  LSD  ",
  "...2C-B!!!",
  "---ketamine---",
  "Salvia divinórum",
  "β-Carboline",
  "Nutmeg™",
  "N,N-Dimethyltryptamine",
  "Δ9-THC",
  "1P-LSD (1-propionyl-LSD)",
  "",
  "   ",
  "!!!",
  "™©®",
];

describe("scripts/lib/slug.mjs", () => {
  it("matches the canonical src/utils/slug.ts implementation on the fixture set", () => {
    for (const fixture of FIXTURES) {
      expect(scriptSlugify(fixture), `fixture: ${JSON.stringify(fixture)}`).toBe(
        canonicalSlugify(fixture),
      );
    }
  });

  it("produces the expected substance slugs", () => {
    expect(scriptSlugify("Psilocybin Mushrooms")).toBe("psilocybin-mushrooms");
    expect(scriptSlugify("2C-B")).toBe("2c-b");
    expect(scriptSlugify("...2C-B!!!")).toBe("2c-b");
    expect(scriptSlugify("Salvia divinórum")).toBe("salvia-divin-rum");
    expect(scriptSlugify("!!!")).toBe("");
  });
});
