import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates simple titles", () => {
    expect(slugify("LSD")).toBe("lsd");
    expect(slugify("Psilocybin Mushrooms")).toBe("psilocybin-mushrooms");
  });

  it("collapses punctuation runs into single dashes", () => {
    expect(slugify("2C-B")).toBe("2c-b");
    expect(slugify("5-MeO-DMT")).toBe("5-meo-dmt");
    expect(slugify("Alpha,beta -- gamma")).toBe("alpha-beta-gamma");
    expect(slugify("GHB/GBL")).toBe("ghb-gbl");
  });

  it("strips leading and trailing junk", () => {
    expect(slugify("  LSD  ")).toBe("lsd");
    expect(slugify("...2C-B!!!")).toBe("2c-b");
    expect(slugify("---ketamine---")).toBe("ketamine");
  });

  it("replaces unicode characters that fall outside a-z0-9", () => {
    expect(slugify("Salvia divinórum")).toBe("salvia-divin-rum");
    expect(slugify("β-Carboline")).toBe("carboline");
    expect(slugify("Nutmeg™")).toBe("nutmeg");
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("!!!")).toBe("");
    expect(slugify("™©®")).toBe("");
  });
});
