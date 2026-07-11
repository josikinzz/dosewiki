import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { validateLegalityDraft } from "./validate-draft";

function validDraft(): Record<string, any> {
  return {
    slug: "example-substance",
    generatedAt: "2026-07-11T00:00:00.000Z",
    international: ["Not scheduled under the 1971 Convention."],
    internationalSources: [{ url: "https://www.incb.org/", title: "INCB" }],
    entries: {
      "United States": {
        canonicalStatus: "prohibited",
        instrument: "Schedule I, Controlled Substances Act (US)",
        status: "Schedule I",
        notes: "The substance is listed in Schedule I.",
        sources: [{
          url: "https://www.deadiversion.usdoj.gov/schedules/",
          title: "Controlled Substances Schedules",
          supportQuote: "Schedule I substances are listed under federal law.",
        }],
      },
    },
    enrichments: {
      Canada: {
        canonicalStatus: "prohibited",
        instrument: "Schedule I",
        sources: [{
          url: "https://laws-lois.justice.gc.ca/",
          title: "Justice Laws Website",
          supportQuote: "Schedule I lists controlled substances.",
        }],
      },
    },
    corrections: {},
    gaps: [],
    refuted: [],
  };
}

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("legality draft validation", () => {
  it("accepts a complete valid draft", () => {
    expect(validateLegalityDraft(validDraft())).toEqual([]);
  });

  it("rejects an unknown canonical status", () => {
    const draft = validDraft();
    draft.entries["United States"].canonicalStatus = "legal_everywhere";
    expect(validateLegalityDraft(draft).join("\n")).toContain("canonicalStatus");
  });

  it("rejects an entry without sources", () => {
    const draft = validDraft();
    draft.entries["United States"].sources = [];
    expect(validateLegalityDraft(draft).join("\n")).toContain("sources");
  });

  it("accepts a valid enrichment", () => {
    expect(validateLegalityDraft(validDraft())).toEqual([]);
  });

  it("accepts a draft without enrichments", () => {
    const draft = validDraft();
    delete draft.enrichments;
    expect(validateLegalityDraft(draft)).toEqual([]);
  });

  it("rejects an enrichment with an unknown canonical status", () => {
    const draft = validDraft();
    draft.enrichments.Canada.canonicalStatus = "legal_everywhere";
    expect(validateLegalityDraft(draft).join("\n")).toContain("enrichments.Canada.canonicalStatus");
  });

  it("rejects an enrichment without sources", () => {
    const draft = validDraft();
    draft.enrichments.Canada.sources = [];
    expect(validateLegalityDraft(draft).join("\n")).toContain("enrichments.Canada.sources");
  });

  it("rejects a correction without oldEntry", () => {
    const draft = validDraft();
    draft.entries = {};
    draft.corrections = {
      Canada: {
        canonicalStatus: "precursor_controlled",
        instrument: "Controlled Drugs and Substances Act",
        status: "Schedule VI precursor",
        notes: "The substance is controlled as a precursor.",
        sources: [{
          url: "https://laws-lois.justice.gc.ca/",
          title: "Justice Laws Website",
          supportQuote: "The schedule includes precursor controls.",
        }],
        whatWasWrong: "The previous entry omitted the precursor classification.",
      },
    };
    expect(validateLegalityDraft(draft).join("\n")).toContain("oldEntry");
  });

  it("rejects a country key that does not resolve", () => {
    const draft = validDraft();
    draft.entries.Freedonia = draft.entries["United States"];
    delete draft.entries["United States"];
    expect(validateLegalityDraft(draft).join("\n")).toContain("Freedonia");
  });

  it("rejects a non-http source URL", () => {
    const draft = validDraft();
    draft.entries["United States"].sources[0].url = "ftp://example.com/law";
    expect(validateLegalityDraft(draft).join("\n")).toContain("http(s)");
  });

  it("accepts the shipped fixture through the CLI", () => {
    const runDir = mkdtempSync(resolve(tmpdir(), "dosewiki-legality-"));
    temporaryDirectories.push(runDir);
    cpSync(resolve("scripts/legality/fixtures/valid-draft.json"), resolve(runDir, "legality-draft.json"));

    const result = spawnSync("bun", ["scripts/legality/validate-draft.ts", "--run", runDir], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Validation passed with 0 error(s).");
  });
});
