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
});
