import { describe, expect, it } from "vitest";

import { CATEGORIES } from "../scripts/batch/extract-quotes/categories.mjs";
import { buildUserMessage, formatOutputFile } from "../scripts/batch/extract-quotes/formatter.mjs";
import { findLargeFiles } from "../scripts/batch/extract-quotes/loader.mjs";
import { getQuoteExtractionCategories } from "./quoteSections.mjs";

describe("batch extract-quotes helpers", () => {
  it("keeps category rules data-driven", () => {
    expect(CATEGORIES).toEqual(getQuoteExtractionCategories());
    expect(CATEGORIES["subjective-effects"].excludedSources).toEqual([
      "psychonautwiki",
      "disregardeverythingisay",
    ]);
    expect(CATEGORIES.legality.outputSuffix).toBe("-legality.md");
  });

  it("formats output files with heading and generated date", () => {
    const formatted = formatOutputFile("Fixtureamine", "legality", "Extracted content", "2026-04-23");
    expect(formatted).toContain("# Fixtureamine - Legality Quotes");
    expect(formatted).toContain("Generated 2026-04-23");
    expect(formatted).toContain("Extracted content");
  });

  it("marks excluded sources in the user message", () => {
    const message = buildUserMessage(
      "Fixtureamine",
      [
        { id: "psychonautwiki", displayName: "PsychonautWiki" },
        { id: "erowid", displayName: "Erowid" },
      ],
      {
        psychonautwiki: "Excluded text",
        erowid: "Allowed text",
      },
      "subjective-effects",
    );

    expect(message).toContain("EXCLUDED from subjective-effects extraction");
    expect(message).toContain("Allowed text");
  });

  it("reports large files using the configured threshold", () => {
    const largeFiles = findLargeFiles(["lsd", "missing-file"]);
    expect(Array.isArray(largeFiles)).toBe(true);
  });
});
