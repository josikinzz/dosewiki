import { describe, expect, it } from "vitest";

import { validateLegalityDraft } from "./validate-draft.ts";

function validDraft() {
  return {
    slug: "example-substance",
    generatedAt: "2026-07-11T00:00:00.000Z",
    international: ["Not scheduled under the 1971 Convention."],
    internationalSources: [{ url: "https://www.incb.org/", title: "INCB" }],
    entries: {
      "United States": {
        canonicalStatus: "prohibited",
        instrument: "Schedule I, Controlled Substances Act (US)",
        designation: "Schedule I",
        status: "Illegal",
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
        designation: "Schedule I",
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

  it("requires status to equal the canonical label", () => {
    const draft = validDraft();
    draft.entries["United States"].status = "Schedule I";

    expect(validateLegalityDraft(draft)).toEqual([
      'entries.United States.status: must be the canonical label "Illegal" for prohibited (got "Schedule I")',
    ]);

    draft.entries["United States"].status = "Illegal";
    expect(validateLegalityDraft(draft)).toEqual([]);
  });

  it("rejects a country key that does not resolve", () => {
    const draft = validDraft();
    draft.entries.Freedonia = draft.entries["United States"];
    delete draft.entries["United States"];
    expect(validateLegalityDraft(draft).join("\n")).toContain("Freedonia");
  });

});
