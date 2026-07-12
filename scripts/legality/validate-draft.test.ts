import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { validateLegalityDraft, validateLegalityDraftWithWarnings } from "./validate-draft";

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
        designation: "Schedule I",
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

  it("accepts editorial notes on entries, enrichments, corrections, and gaps", () => {
    const draft = validDraft();
    draft.entries["United States"].editorialNote = "Confirm the next statutory revision during a future review.";
    draft.enrichments.Canada.editorialNote = "The source URL is stable as of this run.";
    draft.corrections = {
      Canada: {
        canonicalStatus: "prohibited",
        instrument: "Controlled Drugs and Substances Act",
        designation: "Schedule I",
        status: "Schedule I",
        notes: "The substance is listed in Schedule I.",
        editorialNote: "Replace only after an editor reviews the amendment.",
        sources: [{
          url: "https://laws-lois.justice.gc.ca/",
          title: "Justice Laws Website",
          supportQuote: "Schedule I lists controlled substances.",
        }],
        oldEntry: { status: "Schedule I", notes: "The substance is listed in Schedule I." },
        whatWasWrong: "The former instrument name was incomplete.",
      },
    };
    draft.gaps = [{
      country: "France",
      searchesRun: [],
      sourcesInspected: [],
      reason: "No authoritative source was located.",
      editorialNote: "Escalate this gap for a later source pass.",
    }];

    expect(validateLegalityDraft(draft)).toEqual([]);
  });

  it("warns without failing when public notes contain task language", () => {
    const draft = validDraft();
    draft.entries["United States"].notes = "The previous entry must be sourced before publication.";

    const result = validateLegalityDraftWithWarnings(draft);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'warning: entries.United States.notes: task language "The previous" — move to editorialNote or repair the voice.',
    ]);
  });

  it("accepts a compact designation and warns without failing for an overlong or punctuated one", () => {
    const draft = validDraft();
    draft.entries["United States"].designation = "A very long schedule designation that exceeds forty characters";
    draft.enrichments.Canada.designation = "Schedule I; controlled substances";

    const result = validateLegalityDraftWithWarnings(draft);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      "warning: entries.United States.designation: should be a compact tag (40 characters or fewer, without commas or semicolons).",
      "warning: enrichments.Canada.designation: should be a compact tag (40 characters or fewer, without commas or semicolons).",
    ]);
  });

  it("rejects task language in notes repairs", () => {
    const draft = validDraft();
    draft.notesRepairs = {
      "United States": {
        expectedNotes: "The substance is listed in Schedule I.",
        newNotes: "This draft needs verification.",
      },
    };

    expect(validateLegalityDraft(draft).join("\n")).toContain("notesRepairs.United States.newNotes");
  });

  it("accepts a notes repair with reader-facing replacement prose", () => {
    const draft = validDraft();
    draft.notesRepairs = {
      "United States": {
        expectedNotes: "The substance is listed in Schedule I.",
        newNotes: "Federal law lists the substance in Schedule I.",
      },
    };

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

  it("validates mapped US states, city entries, and conforming-majority evidence", () => {
    const draft = validDraft();
    draft.usStates = {
      Colorado: {
        canonicalStatus: "decriminalized",
        instrument: "Colorado Revised Statutes",
        designation: "Decriminalized",
        status: "Decriminalized",
        notes: "Colorado law decriminalizes limited possession.",
        sources: [{
          url: "https://leg.colorado.gov/",
          title: "Colorado General Assembly",
          supportQuote: "Colorado law establishes the possession threshold.",
        }],
        cities: {
          Denver: {
            canonicalStatus: "decriminalized",
            instrument: "Denver Municipal Code",
            designation: "Lowest priority",
            status: "Lowest enforcement priority",
            notes: "Denver treats enforcement as a low priority.",
            sources: [{
              url: "https://library.municode.com/co/denver/codes/code_of_ordinances",
              title: "Denver Municipal Code",
              supportQuote: "The ordinance identifies the enforcement priority.",
            }],
          },
        },
      },
    };
    draft.usStatesNote = "The remaining states follow federal Schedule I controls.";
    draft.usMirrors = [{
      state: "Alabama",
      statuteCitation: "Ala. Code § 20-2-23",
      sourceUrl: "https://www.legislature.state.al.us/",
    }];

    expect(validateLegalityDraft(draft)).toEqual([]);
  });

  it("rejects unmapped US state keys and invalid conforming-majority evidence", () => {
    const draft = validDraft();
    draft.usStates = {
      Freedonia: {
        canonicalStatus: "decriminalized",
        instrument: "Freedonia code",
        status: "Decriminalized",
        notes: "Freedonia law decriminalizes possession.",
        sources: [{ url: "https://example.test/law", title: "Freedonia code", supportQuote: "Control changed." }],
      },
    };
    draft.usMirrors = [{ state: "Freedonia", statuteCitation: "Code 1", sourceUrl: "https://example.test" }];

    const errors = validateLegalityDraft(draft).join("\n");
    expect(errors).toContain("usStates.Freedonia");
    expect(errors).toContain("usMirrors[0].state");
  });

  it("voice-lints US state and summary notes and warns about state designations", () => {
    const draft = validDraft();
    draft.usStates = {
      Colorado: {
        canonicalStatus: "decriminalized",
        instrument: "Colorado Revised Statutes",
        designation: "A long, punctuated state designation",
        status: "Decriminalized",
        notes: "This draft needs verification.",
        sources: [{ url: "https://leg.colorado.gov/", title: "Colorado General Assembly", supportQuote: "Control changed." }],
      },
    };
    draft.usStatesNote = "The previous state summary needs verification.";

    const { errors, warnings } = validateLegalityDraftWithWarnings(draft);
    expect(errors).toEqual([]);
    expect(warnings.join("\n")).toContain("usStates.Colorado.notes");
    expect(warnings.join("\n")).toContain("usStatesNote");
    expect(warnings.join("\n")).toContain("usStates.Colorado.designation");
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
    expect(result.stdout).toContain("Validation passed with 0 error(s), 0 warning(s).");
  });

  it("validates a non-default draft file via --draft-file", () => {
    const runDir = mkdtempSync(resolve(tmpdir(), "dosewiki-legality-"));
    temporaryDirectories.push(runDir);
    cpSync(resolve("scripts/legality/fixtures/valid-draft.json"), resolve(runDir, "citation-flags-draft.json"));

    const result = spawnSync(
      "bun",
      ["scripts/legality/validate-draft.ts", "--run", runDir, "--draft-file", "citation-flags-draft.json"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Validation passed with 0 error(s), 0 warning(s).");
  });
});
