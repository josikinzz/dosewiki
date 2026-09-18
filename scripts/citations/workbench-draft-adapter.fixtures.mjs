export function createArticle() {
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

export function support(referenceId) {
  return [{
    sourceId: `source-${referenceId}`,
    sourceName: `Source ${referenceId}`,
    referenceId,
    supportingQuote: "Quoted support.",
    rationale: "The quote supports the claim.",
  }];
}

export function createWorkbenchDraft() {
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
