import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import { getCategoryForSubstance } from "../parsers/tripsit-combos.ts";
import {
  normalizeParsedInteractions,
  normalizeTripSitInteractions,
  resolveInteractionDataPaths,
} from "./prepopulate-interactions-tripsit-core.mjs";

describe("TripSit interaction prepopulation workflow", () => {
  it("resolves repository data files from the importer location", () => {
    const scriptUrl = new URL("./prepopulate-interactions-tripsit.mjs", import.meta.url);
    const paths = resolveInteractionDataPaths(scriptUrl);
    const expectedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

    expect(paths).toEqual({
      repoRoot: expectedRoot,
      articlesPath: path.join(expectedRoot, "src/data/SubstanceIndex.json"),
      combosPath: path.join(expectedRoot, "src/data/tripsit-combos.json"),
      parsedPath: path.join(expectedRoot, "src/data/parsed-sources.json"),
    });
    expect(existsSync(paths.articlesPath)).toBe(true);
    expect(existsSync(paths.combosPath)).toBe(true);
    expect(existsSync(paths.parsedPath)).toBe(true);
  });

  it("classifies DOET through the canonical DOx matcher", () => {
    expect(getCategoryForSubstance("doet")).toBe("dox");
  });

  it("normalizes TripSit names and maps only supported severity levels", () => {
    expect(normalizeTripSitInteractions({
      amt: { status: "Dangerous" },
      dextromethorphan: { status: "Unsafe", note: "Example note." },
      mdma: { status: "Caution" },
      lsd: { status: "Low Risk & Synergy" },
    })).toEqual({
      interactions: {
        dangerous: ["AMT"],
        unsafe: ["DXM (Example note.)"],
        caution: ["MDMA"],
      },
      lowRiskSkipped: 1,
    });
  });

  it("deduplicates parsed fallback names after canonical formatting", () => {
    expect(normalizeParsedInteractions([
      { substance: "alcohol", severity: "dangerous", source: "psychonautwiki" },
      { substance: "Alcohol", severity: "dangerous", source: "psychonautwiki" },
      { substance: "25x-NBOMe & 25x-NBOH", severity: "dangerous", source: "psychonautwiki" },
      { substance: "nbome", severity: "dangerous", source: "psychonautwiki" },
      { substance: "dxm", severity: "unsafe", source: "other" },
      { substance: "DXM", severity: "unsafe", source: "other" },
      { substance: "mephedrone", severity: "caution", source: "psychonautwiki" },
      { substance: "LSD", severity: "low-risk-synergy", source: "psychonautwiki" },
    ])).toEqual({
      interactions: {
        dangerous: ["Alcohol", "NBOMe compounds"],
        unsafe: ["DXM"],
        caution: ["Mephedrone"],
      },
      sources: ["psychonautwiki", "other"],
      validCount: 7,
    });
  });
});
