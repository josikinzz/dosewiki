import { describe, expect, it } from "vitest";

import {
  assertWorkbenchDraftPromotionAllowed,
  buildWorkbenchApplyDraft,
  buildWorkbenchPromotionPlan,
  normalizeWorkbenchReference,
} from "./workbench-draft-adapter.mjs";

function createArticle() {
  return {
    id: 45,
    slug: "2c-b",
    title: "2C-B",
    summary: "",
    references: [],
    dosage: {
      routes: [{ route: "oral", dose_ranges: {}, notes: "" }],
    },
    duration: {
      routes: [{ route: "oral", stages: {}, half_life: "1.2-2.5 hours" }],
    },
    pharmacology: {
      pharmacodynamics: "2C-B functions primarily as a partial agonist at serotonin 5-HT2 receptors.",
      pharmacokinetics: "The elimination half-life in humans ranges from 1.2 to 2.5 hours.",
      binding_sites: [],
      metabolites: [],
    },
    harm_potential: {},
    interactions: {
      dangerous: [],
      unsafe: [],
      caution: ["MAOIs (MAO-B inhibitors can increase the potency and duration of phenethylamines unpredictably)"],
    },
    history_culture: {
      content: "",
      sections: [
        { heading: "Discovery and Early Research", content: "2C-B was first synthesized in 1974.", subsections: [] },
        { heading: "Therapeutic Use", content: "2C-B found applications among psychotherapists.", subsections: [] },
        { heading: "Commercial Marketing and Recreational Emergence", content: "2C-B was sold as Nexus.", subsections: [] },
      ],
    },
    legality: {
      international: ["UN Convention on Psychotropic Substances Schedule II (added March 2001)"],
      countries: {
        "United States": {
          status: "Schedule I",
          notes: "Classified as a Schedule I controlled substance.",
        },
      },
    },
    source_citations: [],
    citations: [],
  };
}

function support(referenceId) {
  return [{
    sourceId: `source-${referenceId}`,
    sourceName: `Source ${referenceId}`,
    referenceId,
    supportingQuote: "Quoted support.",
    rationale: "The quote supports the claim.",
  }];
}

function createWorkbenchDraft() {
  return {
    taskId: "2c-b",
    generatedAt: "2026-05-31T00:00:00.000Z",
    article: { slug: "2c-b", title: "2C-B" },
    references: [
      {
        id: "pihkal-shulgin-1991",
        type: "book",
        title: "PiHKAL",
        sourceType: "book",
        quality: "medium",
      },
      {
        id: "papaseit-2018-acute-pharmacological-effects-2c-b",
        type: "journal_article",
        title: "Acute Pharmacological Effects of 2C-B in Humans",
        sourceType: "observational_study",
        quality: "high",
      },
      {
        id: "dean-2013-2c-or-not-2c",
        type: "journal_article",
        title: "2C or not 2C",
        sourceType: "review",
        quality: "medium",
      },
      {
        id: "poulie-2020-dark-classics-nbomes",
        type: "journal_article",
        title: "DARK Classics in Chemical Neuroscience: NBOMes",
        sourceType: "review",
        quality: "medium",
      },
      {
        id: "theobald-2007-mao-cyp-2c-series",
        type: "journal_article",
        title: "MAO and CYP in 2C-series metabolism",
      },
      {
        id: "caudevilla-galligo-2012-2c-b-spain",
        type: "journal_article",
        title: "2C-B in Spain",
        sourceType: "observational_study",
        quality: "medium",
      },
      {
        id: "dea-2011-2c-b-street-names",
        type: "government_document",
        title: "2C-B Street Names",
        sourceType: "government",
        quality: "medium",
      },
    ],
    evidence: [
      {
        claimKey: "use_and_effects.dose_duration",
        fieldPath: "use_and_effects.summary",
        claimText: "Alexander Shulgin listed 2C-B's oral dose range as 12 to 24 mg and duration as 4 to 8 hours.",
        status: "supported",
        referenceIds: ["pihkal-shulgin-1991"],
        supports: support("pihkal-shulgin-1991"),
      },
      {
        claimKey: "side_effects.common_adverse_effects",
        fieldPath: "side_effects.summary",
        claimText: "Reported adverse effects of 2C-B include nausea and tachycardia.",
        status: "supported",
        referenceIds: ["papaseit-2018-acute-pharmacological-effects-2c-b"],
        supports: support("papaseit-2018-acute-pharmacological-effects-2c-b"),
      },
      {
        claimKey: "interactions.maoi_potentiation",
        fieldPath: "interactions.summary",
        claimText: "2C-B is metabolized by MAO-A and MAO-B, and MAO inhibitors may potentiate its effects.",
        status: "supported",
        referenceIds: ["theobald-2007-mao-cyp-2c-series", "dean-2013-2c-or-not-2c"],
        supports: [
          ...support("theobald-2007-mao-cyp-2c-series"),
          ...support("dean-2013-2c-or-not-2c"),
        ],
      },
      {
        claimKey: "pharmacokinetics.half_life",
        fieldPath: "pharmacokinetics.summary",
        claimText: "2C-B has an elimination half-life in humans of approximately 1.2 to 2.5 hours.",
        status: "needs_review",
      },
      {
        claimKey: "society_and_culture.name_gap",
        fieldPath: "society_and_culture.summary",
        claimText: "2C-B is sometimes called an unsupported street name.",
        status: "needs_source",
      },
      {
        claimKey: "legal_status.un_and_us_scheduling",
        fieldPath: "legal_status.summary",
        claimText: "The UN added 2C-B to Schedule II and the United States placed it in Schedule I.",
        status: "supported",
        referenceIds: ["poulie-2020-dark-classics-nbomes", "dean-2013-2c-or-not-2c"],
        supports: [
          ...support("poulie-2020-dark-classics-nbomes"),
          ...support("dean-2013-2c-or-not-2c"),
        ],
      },
    ],
    gaps: [
      {
        claimKey: "pharmacokinetics.half_life",
        note: "Half-life range needs a better source.",
      },
    ],
  };
}

describe("workbench draft adapter", () => {
  it("normalizes workbench reference source types to the article schema enum", () => {
    expect(normalizeWorkbenchReference({
      id: "paper",
      title: "Paper",
      type: "government_document",
      sourceType: "government",
    })).toMatchObject({
      id: "paper",
      type: "report",
      sourceType: "government_or_regulatory",
      quality: "fallback",
    });
  });

  it("normalizes unsupported reference templates to the article schema enum", () => {
    expect(normalizeWorkbenchReference({
      id: "chapter",
      title: "Book chapter",
      type: "book_chapter",
      template: "cite_book_chapter",
    })).toMatchObject({
      type: "book_chapter",
      template: "cite_book",
    });
  });

  it("maps supported workbench claims onto renderable article fields and keeps half-life review-only", () => {
    const draft = buildWorkbenchApplyDraft({
      article: {
        ...createArticle(),
        _id: "convex-id",
        _creationTime: 123,
      },
      workbenchDraft: createWorkbenchDraft(),
    });

    expect(draft.article).not.toHaveProperty("_id");
    expect(draft.article).not.toHaveProperty("_creationTime");
    expect(draft.article.dosage.routes[0].reference_ids).toEqual(["pihkal-shulgin-1991"]);
    expect(draft.article.duration.routes[0].reference_ids).toEqual(["pihkal-shulgin-1991"]);
    expect(draft.article.harm_potential.summary).toContain("[cite:papaseit-2018-acute-pharmacological-effects-2c-b]");
    expect(draft.article.interactions.caution[0]).toContain("[cite:theobald-2007-mao-cyp-2c-series]");
    expect(draft.article.legality.international[0]).toContain("[cite:poulie-2020-dark-classics-nbomes]");
    expect(draft.article.legality.countries["United States"].notes).toContain("[cite:dean-2013-2c-or-not-2c]");
    expect(draft.article.pharmacology.pharmacokinetics).not.toContain("[cite:");

    const halfLife = draft.evidence.find((row) => row.claimKey === "pharmacokinetics.half_life");
    expect(halfLife).toMatchObject({
      status: "needs_review",
      referenceIds: [],
      supports: [],
      diagnostics: [expect.objectContaining({ code: "workbench_gap" })],
    });

    const maoi = draft.evidence.find((row) => row.claimKey === "interactions.maoi_potentiation");
    expect(maoi.supports).toHaveLength(2);
    expect(maoi.referenceIds).toEqual(["dean-2013-2c-or-not-2c", "theobald-2007-mao-cyp-2c-series"]);
    expect(maoi.supports[0].verifiedQuote).toMatchObject({
      matchType: "normalized_whitespace",
      startOffset: null,
      endOffset: null,
    });
  });

  it("derives a missing support sourceName from the inspected source record", () => {
    const workbenchDraft = createWorkbenchDraft();
    const [firstSupport] = workbenchDraft.evidence[0].supports;
    delete firstSupport.sourceName;
    workbenchDraft.sources = [{
      id: firstSupport.sourceId,
      title: "PiHKAL inspected excerpt",
      content: "Quoted support.",
    }];

    const plan = buildWorkbenchPromotionPlan({
      article: createArticle(),
      workbenchDraft,
    });
    const evidence = plan.evidence.find((row) => row.claimKey === "use_and_effects.dose_duration");

    expect(evidence.supports).toHaveLength(1);
    expect(evidence.supports[0].sourceName).toBe("PiHKAL inspected excerpt");
  });

  it("derives a missing support sourceName from the structured reference", () => {
    const workbenchDraft = createWorkbenchDraft();
    const [firstSupport] = workbenchDraft.evidence[0].supports;
    delete firstSupport.sourceName;
    workbenchDraft.sources = [];

    const plan = buildWorkbenchPromotionPlan({
      article: createArticle(),
      workbenchDraft,
    });
    const evidence = plan.evidence.find((row) => row.claimKey === "use_and_effects.dose_duration");

    expect(evidence.supports).toHaveLength(1);
    expect(evidence.supports[0].sourceName).toBe("PiHKAL");
  });

  it("builds a workbench promotion plan with the shared write-payload shape", () => {
    const plan = buildWorkbenchPromotionPlan({
      article: createArticle(),
      workbenchDraft: createWorkbenchDraft(),
    });

    expect(plan).toMatchObject({
      kind: "citation-promotion-plan",
      source: "workbench",
      slug: "2c-b",
      approvedWriteMode: "preserve",
      staleClaimKeys: [],
      summary: {
        evidenceRows: 6,
        supportedEvidenceRows: 4,
        reviewEvidenceRows: 1,
      },
      writePayload: {
        slug: "2c-b",
        article: plan.article,
        evidence: plan.evidence,
        approvedWriteMode: "preserve",
        staleClaimKeys: [],
      },
    });
    expect(plan.writePayload).not.toHaveProperty("changes");
    expect(plan.writePayload).not.toHaveProperty("summary");
  });

  it("applies marker-only workbench drafts directly to citable sections", () => {
    const article = createArticle();
    article.summary = "2C-B is a psychedelic phenethylamine first synthesized in the 1970s.";

    const workbenchDraft = {
      taskId: "2c-b",
      generatedAt: "2026-05-31T00:00:00.000Z",
      citationMode: "marker_only",
      article: { slug: "2c-b", title: "2C-B" },
      references: [
        {
          id: "shulgin1991",
          type: "book",
          title: "PiHKAL",
          sourceType: "book",
          quality: "medium",
        },
        {
          id: "dea2cb",
          type: "government_document",
          title: "DEA 2C-B scheduling",
          sourceType: "government",
          quality: "high",
        },
      ],
      markedSections: {
        summary: "2C-B is a psychedelic phenethylamine[cite:shulgin1991] first synthesized in the 1970s.",
        legality: {
          ...article.legality,
          countries: {
            ...article.legality.countries,
            "United States": {
              status: "Schedule I",
              notes: "Classified as a Schedule I controlled substance[cite:dea2cb].",
            },
          },
        },
      },
      evidence: [
        {
          claimKey: "summary.marker.1",
          fieldPath: "summary",
          claimText: "2C-B is a psychedelic phenethylamine first synthesized in the 1970s.",
          status: "supported",
          referenceIds: ["shulgin1991"],
          supports: support("shulgin1991"),
        },
        {
          claimKey: "legality.us.marker.1",
          fieldPath: "legality.countries.United States.notes",
          claimText: "Classified as a Schedule I controlled substance.",
          status: "supported",
          referenceIds: ["dea2cb"],
          supports: support("dea2cb"),
        },
      ],
      gaps: [],
    };

    const draft = buildWorkbenchApplyDraft({ article, workbenchDraft });

    expect(draft.article.summary).toBe(
      "2C-B is a psychedelic phenethylamine[cite:shulgin1991] first synthesized in the 1970s.",
    );
    expect(draft.article.legality.countries["United States"].notes).toBe(
      "Classified as a Schedule I controlled substance[cite:dea2cb].",
    );
    expect(draft.article.dosage).toEqual(article.dosage);
    expect(draft.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "summary" }),
      expect.objectContaining({ path: "legality" }),
    ]));
    expect(draft.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimKey: "summary.marker.1",
        section: "summary",
        status: "supported",
        referenceIds: ["shulgin1991"],
      }),
      expect.objectContaining({
        claimKey: "legality.us.marker.1",
        section: "legality",
        status: "supported",
        referenceIds: ["dea2cb"],
      }),
    ]));
  });

  it("keeps marker-only citations separate when an overlapping PMID has conflicting DOI metadata", () => {
    const article = createArticle();
    article.summary = "2C-B has been screened in rat cortical cultures.";

    const workbenchDraft = {
      taskId: "2c-b",
      generatedAt: "2026-05-31T00:00:00.000Z",
      citationMode: "marker_only",
      article: { slug: "2c-b", title: "2C-B" },
      references: [
        {
          id: "a-kept-neurotoxicity-reference",
          type: "journal_article",
          title: "Neurotoxicity screening of new psychoactive substances",
          doi: "10.1016/j.neuro.2018.03.007",
          pmid: "29572046",
          url: "https://doi.org/10.1016/j.neuro.2018.03.007",
          sourceType: "primary_literature",
          quality: "medium",
        },
        {
          id: "z-dropped-neurotoxicity-reference",
          type: "journal_article",
          title: "Neurotoxicity screening of new psychoactive substances",
          doi: "10.1016/j.ntt.2018.03.001",
          pmid: "29572046",
          url: "https://pubmed.ncbi.nlm.nih.gov/29572046/",
          sourceType: "primary_literature",
          quality: "medium",
        },
      ],
      markedSections: {
        summary: "2C-B has been screened in rat cortical cultures.[cite:z-dropped-neurotoxicity-reference]",
      },
      evidence: [
        {
          claimKey: "summary.marker.1",
          fieldPath: "summary",
          claimText: "2C-B has been screened in rat cortical cultures.",
          status: "supported",
          referenceIds: ["z-dropped-neurotoxicity-reference"],
          supports: support("z-dropped-neurotoxicity-reference"),
        },
      ],
      gaps: [],
    };

    const draft = buildWorkbenchApplyDraft({ article, workbenchDraft });

    expect(draft.article.summary).toBe(
      "2C-B has been screened in rat cortical cultures.[cite:z-dropped-neurotoxicity-reference]",
    );
    expect(draft.article.references).toHaveLength(2);
    expect(draft.evidence[0].referenceIds).toEqual(["z-dropped-neurotoxicity-reference"]);
    expect(draft.evidence[0].supports[0].referenceId).toBe("z-dropped-neurotoxicity-reference");
  });

  it("unconditionally rejects permanently local proposal drafts", () => {
    const article = createArticle();
    article.summary = "Proposal prose that also happens to equal the live article.";
    const workbenchDraft = {
      ...createWorkbenchDraft(),
      provenance: { source: "local_section_proposal", taskMode: "local_experiment", applyBound: false },
      promotion: { allowed: false, policy: "never" },
      inputBinding: {
        schemaVersion: "dosewiki_local_proposal_binding_v1",
        kind: "local_section_proposal",
        slug: "2c-b",
        section: "summary",
      },
      markedSections: { summary: article.summary },
    };

    expect(() => assertWorkbenchDraftPromotionAllowed(workbenchDraft)).toThrow(/permanently review-only/);
    expect(() => buildWorkbenchApplyDraft({ article, workbenchDraft })).toThrow(/permanently review-only/);
    expect(() => buildWorkbenchPromotionPlan({ article, workbenchDraft })).toThrow(/permanently review-only/);
  });

  it("rejects each no-promotion signal before constructing a promotion plan", () => {
    expect(() => buildWorkbenchPromotionPlan({
      article: null,
      workbenchDraft: { taskId: "2c-b--proposal-summary--abcdef123456" },
    })).toThrow(/permanently review-only/);
    expect(() => buildWorkbenchPromotionPlan({
      article: null,
      workbenchDraft: { provenance: { applyBound: false } },
    })).toThrow(/Non-apply-bound/);
    expect(() => buildWorkbenchPromotionPlan({
      article: null,
      workbenchDraft: { promotion: { allowed: false } },
    })).toThrow(/explicitly forbidden/);
  });

  it("applies a scoped marker-only draft to selected pharmacology while an already-cited summary stays untouched", () => {
    const article = createArticle();
    article.summary = "2C-B is a psychedelic phenethylamine[cite:existing-summary-ref] first synthesized in 1974.";
    article.references = [
      {
        id: "existing-summary-ref",
        type: "book",
        title: "PiHKAL",
        sourceType: "book",
        quality: "medium",
      },
    ];

    const workbenchDraft = {
      taskId: "2c-b",
      generatedAt: "2026-05-31T00:00:00.000Z",
      citationMode: "marker_only",
      selectedSections: ["pharmacology"],
      article: { slug: "2c-b", title: "2C-B" },
      references: [
        {
          id: "new-pharm-ref",
          type: "journal_article",
          title: "2C-B receptor pharmacology",
          sourceType: "primary_literature",
          quality: "high",
        },
      ],
      markedSections: {
        pharmacology: {
          ...article.pharmacology,
          pharmacodynamics: "2C-B functions primarily as a partial agonist at serotonin 5-HT2 receptors[cite:new-pharm-ref].",
        },
      },
      evidence: [
        {
          claimKey: "pharmacology.marker.1",
          fieldPath: "pharmacology.pharmacodynamics",
          claimText: "2C-B functions primarily as a partial agonist at serotonin 5-HT2 receptors.",
          status: "supported",
          referenceIds: ["new-pharm-ref"],
          supports: support("new-pharm-ref"),
        },
      ],
      gaps: [],
    };

    const draft = buildWorkbenchApplyDraft({ article, workbenchDraft });

    expect(draft.article.pharmacology.pharmacodynamics).toBe(
      "2C-B functions primarily as a partial agonist at serotonin 5-HT2 receptors[cite:new-pharm-ref].",
    );
    expect(draft.article.summary).toBe(article.summary);
    expect(draft.article.references.map((reference) => reference.id).sort()).toEqual([
      "existing-summary-ref",
      "new-pharm-ref",
    ]);
    expect(draft.changes.map((change) => change.path).sort()).toEqual(["pharmacology", "references"]);
    expect(draft.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimKey: "pharmacology.marker.1",
        section: "pharmacology",
        status: "supported",
        referenceIds: ["new-pharm-ref"],
      }),
    ]));
  });

  it("preserves populated canonical authors while enriching missing fields from a same-ID draft reference", () => {
    const article = createArticle();
    article.references = [
      {
        id: "pmid-19322953",
        type: "journal_article",
        title: "Cached methylphenidate receptor paper",
        authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
        pmid: "19322953",
        containerTitle: null,
        volume: "64",
        sourceType: "primary_literature",
        quality: "high",
      },
    ];

    const draft = buildWorkbenchApplyDraft({
      article,
      workbenchDraft: {
        taskId: "2c-b",
        generatedAt: "2026-05-31T00:00:00.000Z",
        citationMode: "marker_only",
        selectedSections: ["pharmacology"],
        article: { slug: "2c-b", title: "2C-B" },
        references: [
          {
            id: "pmid-19322953",
            type: "journal_article",
            title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
            authors: [],
            pmid: "19322953",
            containerTitle: "Die Pharmazie",
            sourceType: "primary_literature",
            quality: "high",
          },
          {
            id: "doi-10-1055-s-0028-1109182",
            type: "journal_article",
            title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
            authors: ["zhu hj", "Additional Author"],
            pmid: "19322953",
            doi: "10.1055/s-0028-1109182",
            containerTitle: "Die Pharmazie",
            sourceType: "primary_literature",
            quality: "high",
          },
        ],
        markedSections: {
          pharmacology: {
            ...article.pharmacology,
            pharmacodynamics: `${article.pharmacology.pharmacodynamics}[cite:doi-10-1055-s-0028-1109182]`,
          },
        },
        evidence: [
          {
            claimKey: "pharmacology.marker.1",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: article.pharmacology.pharmacodynamics,
            status: "supported",
            referenceIds: ["doi-10-1055-s-0028-1109182"],
            supports: support("doi-10-1055-s-0028-1109182"),
          },
        ],
        gaps: [],
      },
    });

    const reference = draft.article.references.find(({ id }) => id === "pmid-19322953");
    expect(reference).toEqual(expect.objectContaining({
      title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
      authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ", "Additional Author"],
      containerTitle: "Die Pharmazie",
      volume: "64",
      pmid: "19322953",
      doi: "10.1055/s-0028-1109182",
    }));
    expect(draft.article.references.filter(({ pmid }) => pmid === "19322953")).toHaveLength(1);
    expect(draft.article.pharmacology.pharmacodynamics).toContain("[cite:pmid-19322953]");
    expect(draft.evidence[0].referenceIds).toEqual(["pmid-19322953"]);
  });

  it("does not collapse a reviewed draft reference onto a conflicting stable identity", () => {
    const article = createArticle();
    article.references = [{
      id: "stored-reference",
      type: "journal_article",
      title: "Stored work",
      authors: ["Stored Author"],
      doi: "10.1000/stored",
      pmid: "19322953",
      sourceType: "primary_literature",
      quality: "high",
    }];
    const claim = article.pharmacology.pharmacodynamics;

    const draft = buildWorkbenchApplyDraft({
      article,
      workbenchDraft: {
        taskId: "2c-b",
        generatedAt: "2026-05-31T00:00:00.000Z",
        citationMode: "marker_only",
        selectedSections: ["pharmacology"],
        article: { slug: "2c-b", title: "2C-B" },
        references: [{
          id: "incoming-reference",
          type: "journal_article",
          title: "Incoming work",
          authors: ["Incoming Author"],
          doi: "10.1000/incoming",
          pmid: "19322953",
          sourceType: "primary_literature",
          quality: "high",
        }],
        markedSections: {
          pharmacology: {
            ...article.pharmacology,
            pharmacodynamics: `${claim}[cite:incoming-reference]`,
          },
        },
        evidence: [{
          claimKey: "pharmacology.marker.1",
          fieldPath: "pharmacology.pharmacodynamics",
          claimText: claim,
          status: "supported",
          referenceIds: ["incoming-reference"],
          supports: support("incoming-reference"),
        }],
        gaps: [],
      },
    });

    expect(draft.article.references).toHaveLength(2);
    expect(draft.article.pharmacology.pharmacodynamics).toContain("[cite:incoming-reference]");
    expect(draft.evidence[0].referenceIds).toEqual(["incoming-reference"]);
  });

  it("rejects a scoped draft whose markedSections include a non-selected section", () => {
    const article = createArticle();
    article.summary = "2C-B is a psychedelic phenethylamine[cite:existing-summary-ref] first synthesized in 1974.";
    article.references = [{ id: "existing-summary-ref", type: "book", title: "PiHKAL" }];

    expect(() => buildWorkbenchApplyDraft({
      article,
      workbenchDraft: {
        taskId: "2c-b",
        citationMode: "marker_only",
        selectedSections: ["pharmacology"],
        article: { slug: "2c-b", title: "2C-B" },
        references: [{ id: "new-pharm-ref", type: "journal_article", title: "Paper" }],
        markedSections: {
          pharmacology: {
            ...article.pharmacology,
            pharmacodynamics: "2C-B functions primarily as a partial agonist at serotonin 5-HT2 receptors[cite:new-pharm-ref].",
          },
          summary: "2C-B is a psychedelic phenethylamine[cite:existing-summary-ref] first synthesized in 1974[cite:new-pharm-ref].",
        },
        evidence: [
          {
            claimKey: "pharmacology.marker.1",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: "2C-B functions primarily as a partial agonist at serotonin 5-HT2 receptors.",
            status: "supported",
            referenceIds: ["new-pharm-ref"],
            supports: support("new-pharm-ref"),
          },
        ],
        gaps: [],
      },
    })).toThrow(/not in selectedSections/i);
  });

  it("rejects a scoped draft with evidence rows outside selectedSections", () => {
    const article = createArticle();

    expect(() => buildWorkbenchApplyDraft({
      article,
      workbenchDraft: {
        taskId: "2c-b",
        citationMode: "marker_only",
        selectedSections: ["pharmacology"],
        article: { slug: "2c-b", title: "2C-B" },
        references: [{ id: "new-pharm-ref", type: "journal_article", title: "Paper" }],
        markedSections: {
          pharmacology: {
            ...article.pharmacology,
            pharmacodynamics: "2C-B functions primarily as a partial agonist at serotonin 5-HT2 receptors[cite:new-pharm-ref].",
          },
        },
        evidence: [
          {
            claimKey: "pharmacology.marker.1",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: "2C-B functions primarily as a partial agonist at serotonin 5-HT2 receptors.",
            status: "supported",
            referenceIds: ["new-pharm-ref"],
            supports: support("new-pharm-ref"),
          },
          {
            claimKey: "summary.marker.1",
            fieldPath: "summary",
            claimText: "2C-B is a psychedelic phenethylamine.",
            status: "supported",
            referenceIds: ["new-pharm-ref"],
            supports: support("new-pharm-ref"),
          },
        ],
        gaps: [],
      },
    })).toThrow(/not in selectedSections/i);
  });

  it("rejects malformed selectedSections scopes", () => {
    const article = createArticle();
    const baseDraft = {
      taskId: "2c-b",
      citationMode: "marker_only",
      article: { slug: "2c-b", title: "2C-B" },
      references: [],
      markedSections: { pharmacology: article.pharmacology },
      evidence: [],
      gaps: [],
    };

    expect(() => buildWorkbenchApplyDraft({
      article,
      workbenchDraft: { ...baseDraft, selectedSections: [] },
    })).toThrow(/non-empty/i);
    expect(() => buildWorkbenchApplyDraft({
      article,
      workbenchDraft: { ...baseDraft, selectedSections: ["dosage"] },
    })).toThrow(/citable/i);
    expect(() => buildWorkbenchApplyDraft({
      article,
      workbenchDraft: { ...baseDraft, selectedSections: ["pharmacology", "pharmacology"] },
    })).toThrow(/duplicate/i);
  });

  it("rejects marker-only workbench drafts that rewrite article text", () => {
    const article = createArticle();
    article.summary = "2C-B is a psychedelic phenethylamine first synthesized in the 1970s.";

    expect(() => buildWorkbenchApplyDraft({
      article,
      workbenchDraft: {
        taskId: "2c-b",
        generatedAt: "2026-05-31T00:00:00.000Z",
        citationMode: "marker_only",
        article: { slug: "2c-b", title: "2C-B" },
        references: [
          {
            id: "shulgin1991",
            type: "book",
            title: "PiHKAL",
            sourceType: "book",
            quality: "medium",
          },
        ],
        markedSections: {
          summary: "2C-B is a psychedelic phenethylamine first described in the 1970s[cite:shulgin1991].",
        },
        evidence: [
          {
            claimKey: "summary.marker.1",
            fieldPath: "summary",
            claimText: "2C-B is a psychedelic phenethylamine first synthesized in the 1970s.",
            status: "supported",
            referenceIds: ["shulgin1991"],
            supports: support("shulgin1991"),
          },
        ],
        gaps: [],
      },
    })).toThrow(/marker-only draft failed validation/i);
  });
});
