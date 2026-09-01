import { describe, expect, it, vi } from "vitest";

import { buildApplyPlan, printPlan } from "./apply-draft.mjs";

const article = {
  legality: {
    international: [],
    countries: {
      Canada: {
        status: "Schedule I",
        notes: "Federal control.",
      },
    },
  },
};

const draft = {
  entries: {
    Netherlands: {
      status: "List I",
      notes: "National control.",
      canonicalStatus: "prohibited",
      instrument: "Opium Act",
      designation: "List I",
    },
  },
  corrections: {},
  enrichments: {
    Canada: {
      canonicalStatus: "prohibited",
      instrument: "Controlled Drugs and Substances Act",
      designation: "Schedule I",
    },
  },
  international: [],
  usStates: {
    Colorado: {
      status: "Decriminalized",
      notes: "State law decriminalizes limited possession.",
      canonicalStatus: "decriminalized",
      instrument: "Colorado Revised Statutes",
      designation: "Decriminalized",
      cities: {
        Denver: {
          status: "Lowest enforcement priority",
          notes: "Denver treats enforcement as a low priority.",
          canonicalStatus: "decriminalized",
          instrument: "Denver Municipal Code",
          designation: "Lowest priority",
        },
      },
    },
  },
  usStatesNote: "The remaining states follow federal controls.",
};

describe("legality draft apply plan", () => {
  it("writes designation for entries and non-destructively adds it for enrichments", () => {
    const plan = buildApplyPlan({ article, draft });

    expect(plan.legality.countries.Netherlands).toMatchObject({ designation: "List I" });
    expect(plan.legality.countries.Canada).toMatchObject({
      status: "Schedule I",
      notes: "Federal control.",
      designation: "Schedule I",
    });
  });

  it("accepts correction oldEntry text that differs only by citation markers", () => {
    const plan = buildApplyPlan({
      article,
      draft: {
        ...draft,
        entries: {},
        enrichments: {},
        corrections: {
          Canada: {
            status: "Schedule I",
            notes: "Updated federal control.",
            canonicalStatus: "prohibited",
            instrument: "Controlled Drugs and Substances Act",
            oldEntry: {
              status: "Schedule I",
              notes: "Federal[cite:canada-law] control.",
            },
          },
        },
      },
    });

    expect(plan.corrected).toEqual([
      { country: "Canada", oldStatus: "Schedule I", newStatus: "Schedule I" },
    ]);
  });

  it("writes designation for corrections", () => {
    const plan = buildApplyPlan({
      article,
      draft: {
        ...draft,
        entries: {},
        enrichments: {},
        corrections: {
          Canada: {
            status: "Schedule I",
            notes: "Updated federal control.",
            canonicalStatus: "prohibited",
            instrument: "Controlled Drugs and Substances Act",
            designation: "Schedule I",
            oldEntry: {
              status: "Schedule I",
              notes: "Federal control.",
            },
          },
        },
      },
    });

    expect(plan.legality.countries.Canada).toMatchObject({ designation: "Schedule I" });
  });

  it("removes a stale country key only when its live value matches", () => {
    const removal = {
      country: "United States (Florida)",
      reason: "Florida is represented in the authoritative US-state subsection.",
      oldEntry: {
        status: "Schedule I",
        notes: "State control.",
      },
    };
    const articleWithLegacyState = {
      legality: {
        international: [],
        countries: {
          "United States (Florida)": {
            status: "Schedule I",
            notes: "State[cite:florida-law] control.",
          },
        },
      },
    };
    const removalDraft = {
      ...draft,
      entries: {},
      enrichments: {},
      corrections: {},
      countryRemovals: [removal],
    };

    const plan = buildApplyPlan({ article: articleWithLegacyState, draft: removalDraft });

    expect(plan.legality.countries["United States (Florida)"]).toBeUndefined();
    expect(plan.removed).toEqual([removal]);
    expect(() => buildApplyPlan({
      article: {
        ...articleWithLegacyState,
        legality: {
          ...articleWithLegacyState.legality,
          countries: {
            "United States (Florida)": {
              status: "Schedule I",
              notes: "Changed live notes.",
            },
          },
        },
      },
      draft: removalDraft,
    })).toThrow("Stale removal for United States (Florida)");
  });

  it("applies status, designation, and instrument repairs against matching live values", () => {
    const liveArticle = {
      legality: {
        international: [],
        countries: {
          Canada: {
            status: "Unscheduled",
            notes: "Federal control.",
            canonicalStatus: "unscheduled",
            instrument: "Act as inspected [cite:a]",
            designation: "restricted_other",
          },
        },
      },
    };
    const repairDraft = {
      entries: {},
      corrections: {},
      international: [],
      statusRepairs: { Canada: { expectedStatus: "Unscheduled", newStatus: "Not scheduled" } },
      designationRepairs: { Canada: { expectedDesignation: "restricted_other", newDesignation: null } },
      instrumentRepairs: {
        Canada: {
          expectedInstrument: "Act as inspected [cite:a]",
          newInstrument: "Controlled Drugs and Substances Act [cite:a]",
        },
      },
    };

    const plan = buildApplyPlan({ article: liveArticle, draft: repairDraft });
    expect(plan.legality.countries.Canada).toEqual({
      status: "Not scheduled",
      notes: "Federal control.",
      canonicalStatus: "unscheduled",
      instrument: "Controlled Drugs and Substances Act [cite:a]",
    });
    expect(plan.statusRepaired).toEqual(["Canada"]);
    expect(plan.designationRepaired).toEqual(["Canada"]);
    expect(plan.instrumentRepaired).toEqual(["Canada"]);
  });

  it("rejects a stale status repair", () => {
    const liveArticle = {
      legality: { international: [], countries: { Canada: { status: "Illegal", notes: "n" } } },
    };
    const repairDraft = {
      entries: {},
      corrections: {},
      international: [],
      statusRepairs: { Canada: { expectedStatus: "Unscheduled", newStatus: "Not scheduled" } },
    };

    expect(() => buildApplyPlan({ article: liveArticle, draft: repairDraft })).toThrow(
      /live status no longer matches/,
    );
  });

  it("includes designation in dry-run rows", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const plan = buildApplyPlan({ article, draft });

    printPlan(plan, draft);

    expect(log).toHaveBeenCalledWith("ADD Netherlands [prohibited] List I");
    expect(log).toHaveBeenCalledWith("ENRICH Canada [prohibited] Schedule I");
    expect(log).toHaveBeenCalledWith("STATE Colorado [decriminalized] Decriminalized");
    expect(log).toHaveBeenCalledWith("CITY Colorado/Denver [decriminalized] Lowest priority");
    expect(log).toHaveBeenCalledWith("US STATES NOTE: The remaining states follow federal controls.");
    log.mockRestore();
  });

  it("replaces only the authoritative US-state subsection and preserves unrelated legality data", () => {
    const plan = buildApplyPlan({
      article: {
        legality: {
          ...article.legality,
          usStates: {
            Oregon: { status: "Legacy", notes: "Legacy state entry." },
          },
          usStatesNote: "Legacy summary.",
        },
      },
      draft,
    });

    expect(plan.legality.countries.Canada).toMatchObject({ status: "Schedule I" });
    expect(plan.legality.usStates).toEqual({
      Colorado: expect.objectContaining({
        designation: "Decriminalized",
        cities: {
          Denver: expect.objectContaining({ designation: "Lowest priority" }),
        },
      }),
    });
    expect(plan.legality.usStatesNote).toBe("The remaining states follow federal controls.");
    expect(plan.states).toEqual([{ state: "Colorado", cities: ["Denver"] }]);
  });

  it("flags a refuted correction on an existing live entry with citationNeeded, non-destructively", () => {
    const plan = buildApplyPlan({
      article: {
        legality: {
          international: [],
          countries: {
            Bahamas: {
              status: "Legal",
              notes: "Psilocybin mushrooms are legal to possess, cultivate, and consume under Bahamian law.",
            },
          },
        },
      },
      draft: {
        ...draft,
        entries: {},
        enrichments: {},
        corrections: {},
        refuted: [
          { country: "Bahamas", reason: "Cited sources concern compounds, not the fungus itself." },
        ],
      },
    });

    expect(plan.legality.countries.Bahamas).toEqual({
      status: "Legal",
      notes: "Psilocybin mushrooms are legal to possess, cultivate, and consume under Bahamian law.",
      citationNeeded: true,
    });
    expect(plan.flagged).toEqual([
      { country: "Bahamas", reason: "Cited sources concern compounds, not the fungus itself." },
    ]);
  });

  it("does not flag a refuted country that was never published (no live entry)", () => {
    const plan = buildApplyPlan({
      article,
      draft: {
        ...draft,
        entries: {},
        enrichments: {},
        corrections: {},
        refuted: [
          { country: "France", reason: "No primary legal source could confirm the proposed entry." },
        ],
      },
    });

    expect(plan.legality.countries.France).toBeUndefined();
    expect(plan.flagged).toEqual([]);
  });

  it("clears a stale citationNeeded flag once the entry is verified via enrichment", () => {
    const plan = buildApplyPlan({
      article: {
        legality: {
          international: [],
          countries: {
            Canada: {
              status: "Schedule I",
              notes: "Federal control.",
              citationNeeded: true,
            },
          },
        },
      },
      draft: {
        ...draft,
        entries: {},
        corrections: {},
      },
    });

    expect(plan.legality.countries.Canada).not.toHaveProperty("citationNeeded");
  });

  it("includes FLAG rows and the flag count in dry-run output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const plan = buildApplyPlan({
      article: {
        legality: {
          international: [],
          countries: {
            Bahamas: { status: "Legal", notes: "Unsourced legacy claim." },
          },
        },
      },
      draft: {
        ...draft,
        entries: {},
        enrichments: {},
        corrections: {},
        refuted: [{ country: "Bahamas", reason: "No primary source confirms this." }],
      },
    });

    printPlan(plan, { ...draft, entries: {}, enrichments: {}, corrections: {} });

    expect(log).toHaveBeenCalledWith("FLAG Bahamas citation needed (refuted: No primary source confirms this.)");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("1 flag"));
    log.mockRestore();
  });
});
