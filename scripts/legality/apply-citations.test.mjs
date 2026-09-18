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
      usStates: {
        Colorado: {
          status: "Decriminalized",
          notes: "State law decriminalizes limited possession.",
          canonicalStatus: "decriminalized",
          instrument: "Colorado Revised Statutes",
          cities: {
            Denver: {
              status: "Lowest enforcement priority",
              notes: "Denver treats enforcement as a low priority.",
              canonicalStatus: "decriminalized",
              instrument: "Denver Municipal Code",
            },
          },
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
    usStates: {
      Colorado: {
        canonicalStatus: "decriminalized",
        instrument: "Colorado Revised Statutes",
        sources: [{
          url: "https://leg.colorado.gov/statute",
          title: "Colorado Revised Statutes",
          supportQuote: "Colorado law decriminalizes limited possession.",
        }],
        cities: {
          Denver: {
            canonicalStatus: "decriminalized",
            instrument: "Denver Municipal Code",
            sources: [{
              url: "https://library.municode.com/denver",
              title: "Denver Municipal Code",
              supportQuote: "Denver identifies enforcement as a low priority.",
            }],
          },
        },
      },
    },
  };
}

describe("legality citation adapter", () => {
  it("reuses equivalent references, creates page-specific ids, and marks only the instrument", () => {
    const plan = buildLegalityCitationPlan({ article: article(), draft: draft() });

    expect(plan.promotionPlan.references.map((reference) => reference.id)).toEqual([
      "existing-act",
      "laws-example-gov-controlled-drugs-act",
      "leg-colorado-gov-colorado-revised-statutes",
      "library-municode-com-denver-municipal-code",
    ]);
    expect(plan.promotionPlan.evidence).toHaveLength(3);
    expect(plan.promotionPlan.references[0]).toMatchObject({
      id: "existing-act",
      siteName: "laws.example.gov",
      metadataProvenance: [{
        kind: "inspected",
        source: "legality-citation-workflow",
      }],
    });
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

  it("does not merge a legality source into an overlapping DOI with a contradictory canonical URL", () => {
    const canonicalReference = {
      id: "canonical-law",
      type: "webpage",
      title: "Canonical law title",
      authors: ["Canonical Author"],
      doi: "10.1000/shared-law",
      url: "https://laws.example.gov/canonical-law",
      metadataProvenance: [{
        kind: "cached",
        source: "legacy-cache",
        fields: ["title", "authors", "doi", "url"],
      }],
    };
    const liveArticle = article();
    liveArticle.references = [canonicalReference];
    const legalityDraft = draft();
    legalityDraft.entries.Canada.sources = [{
      url: "https://doi.org/10.1000/shared-law",
      title: "Inspected but contradictory law title",
      supportQuote: "Schedule I lists controlled substances.",
    }];

    const plan = buildLegalityCitationPlan({ article: liveArticle, draft: legalityDraft });

    expect(plan.promotionPlan.references).toHaveLength(4);
    expect(plan.promotionPlan.references[0]).toEqual(canonicalReference);
    expect(plan.promotionPlan.references[0].authors).not.toContain("Inspected but contradictory law title");
    expect(plan.promotionPlan.references[0].metadataProvenance).toEqual(
      canonicalReference.metadataProvenance,
    );
    expect(plan.promotionPlan.references[1]).toMatchObject({
      title: "Inspected but contradictory law title",
      url: "https://doi.org/10.1000/shared-law",
      metadataProvenance: [{
        kind: "inspected",
        source: "legality-citation-workflow",
      }],
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

  it("harvests state and city sources with jurisdiction-specific evidence", () => {
    const plan = buildLegalityCitationPlan({ article: article(), draft: draft() });

    expect(plan.countries.map((entry) => entry.country)).toEqual([
      "Canada",
      "Colorado (US state)",
      "Denver, Colorado (US city)",
    ]);
    expect(plan.promotionPlan.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimKey: "legality:legality.usStates.colorado.instrument",
        supportRationale: "Supports the Colorado (US state) legality status: decriminalized, Colorado Revised Statutes.",
      }),
      expect.objectContaining({
        claimKey: "legality:legality.usStates.colorado.cities.denver.instrument",
        supportRationale: "Supports the Denver, Colorado (US city) legality status: decriminalized, Denver Municipal Code.",
      }),
    ]));
    expect(plan.articleForMarker.legality.usStates.Colorado.instrument).toContain("[cite:");
    expect(plan.articleForMarker.legality.usStates.Colorado.cities.Denver.instrument).toContain("[cite:");
  });
});
