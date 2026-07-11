import { describe, expect, it } from "vitest";

import { buildLegalityCitationPlan } from "./apply-citations.mjs";

function article() {
  return {
    id: 1,
    slug: "example-substance",
    title: "Example substance",
    references: [{
      id: "existing-act",
      title: "Controlled Drugs Act",
      url: "https://laws.example.gov/act",
    }],
    legality: {
      countries: {
        Canada: {
          status: "Schedule I",
          notes: "The substance is listed in Schedule I.",
          canonicalStatus: "prohibited",
          instrument: "Controlled Drugs Act",
        },
      },
    },
  };
}

function draft() {
  return {
    entries: {
      Canada: {
        canonicalStatus: "prohibited",
        instrument: "Controlled Drugs Act",
        sources: [
          {
            url: "https://laws.example.gov/act",
            title: "Controlled Drugs Act",
            supportQuote: "Schedule I lists controlled substances.",
          },
          {
            url: "https://laws.example.gov/index",
            title: "Justice Laws index",
            supportQuote: "",
          },
        ],
      },
    },
    corrections: {},
    enrichments: {},
  };
}

describe("legality citation adapter", () => {
  it("reuses equivalent references, creates page-specific ids, and marks only the instrument", () => {
    const plan = buildLegalityCitationPlan({ article: article(), draft: draft() });

    expect(plan.promotionPlan.references.map((reference) => reference.id)).toEqual([
      "existing-act",
      "laws-example-gov-controlled-drugs-act",
    ]);
    expect(plan.promotionPlan.evidence).toHaveLength(1);
    expect(plan.promotionPlan.evidence[0]).toMatchObject({
      claimKey: "legality:legality.countries.canada.instrument",
      referenceIds: ["existing-act"],
      status: "supported",
      supports: [{
        referenceId: "existing-act",
        supportingQuote: "Schedule I lists controlled substances.",
      }],
    });
    expect(plan.articleForMarker.legality.countries.Canada).toMatchObject({
      status: "Schedule I",
      notes: "The substance is listed in Schedule I.",
      instrument: "Controlled Drugs Act [cite:existing-act][cite:laws-example-gov-controlled-drugs-act]",
    });
  });

  it("does not append markers a second time", () => {
    const first = buildLegalityCitationPlan({ article: article(), draft: draft() });
    const second = buildLegalityCitationPlan({
      article: { ...article(), ...first.articleForMarker },
      draft: draft(),
    });

    expect(second.countries[0].alreadyMarked).toBe(true);
    expect(second.articleForMarker.legality.countries.Canada.instrument)
      .toBe(first.articleForMarker.legality.countries.Canada.instrument);
  });
});
