import { describe, expect, it } from "vitest";

import { buildLegalityCitationPlan } from "./apply-citations.mjs";
import { buildApplyPlan } from "./apply-draft.mjs";
import { mergeArticleReferenceMetadataForReplacement } from "../../server/lib/substanceIngestion.ts";

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

  it("keeps distinct source pages uniquely addressable when generated ids collide", () => {
    const input = article();
    input.references = [];
    const sources = [1, 5, 4, 2].map((number) => ({
      url: `https://www.legislation.gov.uk/uksi/2001/3998/regulation/${number}`,
      title: `Misuse of Drugs Regulations 2001, regulation ${number}`,
      supportQuote: `Operative text of regulation ${number}.`,
    }));
    const proposal = { entries: { Canada: {
      canonicalStatus: "prohibited",
      instrument: "Controlled Drugs Act",
      sources,
    } } };
    const first = buildLegalityCitationPlan({ article: input, draft: proposal });
    const references = first.articleForMarker.references;
    const ids = first.countries[0].referenceIds;
    expect(ids).toHaveLength(sources.length);
    for (const id of ids) {
      expect(references.filter((reference) => reference.id === id)).toHaveLength(1);
    }
    expect(ids.map((id) => references.find((reference) => reference.id === id).url))
      .toEqual(sources.map((source) => source.url));
    expect(first.promotionPlan.evidence).toHaveLength(sources.length);
    const replay = buildLegalityCitationPlan({ article: first.articleForMarker, draft: proposal });
    expect(replay.articleForMarker.references).toEqual(references);
    expect(replay.articleForMarker.legality).toEqual(first.articleForMarker.legality);
  });

  it("preserves ambiguous legacy references while giving reviewed sources unique markers", () => {
    const input = article();
    input.references = [
      { id: "shared", url: "https://laws.example.gov/section/2", title: "Section 2" },
      { id: "shared", url: "https://laws.example.gov/section/4", title: "Section 4" },
      { id: "shared", url: "https://laws.example.gov/section/5", title: "Section 5" },
    ];
    const original = structuredClone(input.references);
    const sources = original.map(({ url, title }) => ({ url, title, supportQuote: "Operative provision." }));
    const proposal = { entries: { Canada: { instrument: "Controlled Drugs Act", canonicalStatus: "prohibited", sources } } };
    const first = buildLegalityCitationPlan({ article: input, draft: proposal });
    const references = first.articleForMarker.references;
    expect(references.filter(({ id }) => id === "shared")).toEqual(original);
    for (const [index, id] of first.countries[0].referenceIds.entries()) {
      expect(references.filter((reference) => reference.id === id)).toEqual([
        expect.objectContaining({ url: sources[index].url }),
      ]);
    }
    const replay = buildLegalityCitationPlan({ article: first.articleForMarker, draft: proposal });
    expect(replay.articleForMarker).toEqual(first.articleForMarker);
  });

  it("preserves unrelated distinct sources across apply and cite replacement without guessing shared markers", () => {
    const input = article();
    const stateSources = [401, 402].map((section) => ({
      id: "shared-state-source",
      title: "State controlled substances act",
      url: `https://laws.example.gov/state/section/${section}`,
    }));
    input.references.push(...stateSources);
    input.legality.usStates.Colorado.instrument += " [cite:shared-state-source]";
    const proposal = { international: [], entries: {}, corrections: { Canada: {
      ...input.legality.countries.Canada,
      oldEntry: structuredClone(input.legality.countries.Canada),
      sources: draft().entries.Canada.sources,
    } } };

    const apply = buildApplyPlan({ article: input, draft: proposal });
    const applied = mergeArticleReferenceMetadataForReplacement(
      { ...input, legality: apply.legality }, input.references,
    ).article;
    const cite = buildLegalityCitationPlan({ article: applied, draft: proposal });
    const saved = mergeArticleReferenceMetadataForReplacement(
      cite.articleForMarker, applied.references,
    ).article;

    const stateIds = stateSources.map(({ url }) => {
      const matches = saved.references.filter((reference) => reference.url === url);
      expect(matches).toHaveLength(1);
      return matches[0].id;
    });
    expect(new Set(stateIds).size).toBe(stateSources.length);
    expect(stateIds).not.toContain("shared-state-source");
    expect(saved.legality.usStates).toEqual(input.legality.usStates);
    for (const [index, id] of cite.countries[0].referenceIds.entries()) {
      expect(saved.references.filter((reference) => reference.id === id)).toEqual([
        expect.objectContaining({ url: proposal.corrections.Canada.sources[index].url }),
      ]);
    }
    const replay = buildLegalityCitationPlan({ article: saved, draft: proposal });
    expect(mergeArticleReferenceMetadataForReplacement(
      replay.articleForMarker, saved.references,
    ).article).toEqual(saved);
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
