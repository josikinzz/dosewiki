import { describe, expect, it } from "vitest";

import {
  FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
  FormalCitationContractError,
  parseFormalCitationSectionResponse,
} from "./formal-citations-contract.mjs";

function createContext() {
  return {
    sectionKey: "pharmacology",
    article: {
      slug: "2c-b",
      title: "2C-B",
      references: [
        {
          id: "url-erowid-abc123",
          title: "Erowid 2C-B Vault",
          siteName: "Erowid",
          url: "https://www.erowid.org/chemicals/2cb/",
        },
      ],
    },
    articleSources: {
      contents: {
        erowid: "2C-B is a psychedelic phenethylamine with serotonin receptor activity.",
      },
    },
    sourcePacket: {
      compiledSources: [
        {
          id: "erowid",
          displayName: "Erowid",
          excerpt: "2C-B is a psychedelic phenethylamine with serotonin receptor activity.",
        },
      ],
    },
    targets: [
      {
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        fieldPath: "pharmacology.pharmacodynamics",
        claimText: "2C-B is a psychedelic phenethylamine.",
      },
    ],
  };
}

function makeSupport(overrides = {}) {
  return {
    sourceId: "erowid",
    sourceName: "Erowid",
    referenceId: "url-erowid-abc123",
    supportingQuote: "2C-B is a psychedelic phenethylamine",
    rationale: "The bounded source states this directly.",
    ...overrides,
  };
}

function makePayload(overrides = {}) {
  return {
    schemaVersion: FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
    sectionKey: "pharmacology",
    summary: "One short sentence.",
    notes: [],
    claims: [
      {
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        fieldPath: "pharmacology.pharmacodynamics",
        claimText: "2C-B is a psychedelic phenethylamine.",
        status: "supported",
        statusReason: "",
        supports: [makeSupport()],
      },
    ],
    ...overrides,
  };
}

describe("formal citations contract", () => {
  it("rejects malformed top-level payloads", () => {
    expect(() => parseFormalCitationSectionResponse({
      ...createContext(),
      payload: {
        schemaVersion: FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
        sectionKey: "pharmacology",
        summary: "Missing claims array.",
      },
    })).toThrowError(FormalCitationContractError);
  });

  it("fails closed on unknown claim keys by ignoring them and backfilling missing targets", () => {
    const result = parseFormalCitationSectionResponse({
      ...createContext(),
      payload: makePayload({
        claims: [
          {
            claimKey: "pharmacology:unknown",
            fieldPath: "pharmacology.unknown",
            claimText: "Unknown claim",
            status: "supported",
            statusReason: "",
            supports: [makeSupport({ rationale: "Wrong target" })],
          },
        ],
      }),
    });

    expect(result.claims).toEqual([
      expect.objectContaining({
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        status: "needs_source",
      }),
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unknown_claim_key" }),
      expect.objectContaining({ code: "missing_claim" }),
    ]));
  });

  it("downgrades unsupported quotes before merge", () => {
    const result = parseFormalCitationSectionResponse({
      ...createContext(),
      payload: makePayload({
        claims: [
          {
            claimKey: "pharmacology:pharmacology.pharmacodynamics",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: "2C-B is a psychedelic phenethylamine.",
            status: "supported",
            statusReason: "",
            supports: [makeSupport({
              supportingQuote: "This quote does not exist in the source",
              rationale: "Supposed support.",
            })],
          },
        ],
      }),
    });

    expect(result.claims[0]).toMatchObject({
      status: "needs_source",
      referenceIds: [],
      supports: [],
    });
    expect(result.claims[0].diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "quote_not_found" }),
    ]));
  });

  it("downgrades invalid references to needs_review instead of allowing a supported merge", () => {
    const result = parseFormalCitationSectionResponse({
      ...createContext(),
      payload: makePayload({
        claims: [
          {
            claimKey: "pharmacology:pharmacology.pharmacodynamics",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: "2C-B is a psychedelic phenethylamine.",
            status: "supported",
            statusReason: "",
            supports: [makeSupport({
              referenceId: "url-nonexistent-123",
            })],
          },
        ],
      }),
    });

    expect(result.claims[0]).toMatchObject({
      status: "needs_review",
      referenceIds: [],
      supports: [],
    });
    expect(result.claims[0].diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unknown_reference_id" }),
    ]));
  });

  it("fails closed on conflicting duplicate claim rows", () => {
    const result = parseFormalCitationSectionResponse({
      ...createContext(),
      payload: makePayload({
        claims: [
          {
            claimKey: "pharmacology:pharmacology.pharmacodynamics",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: "2C-B is a psychedelic phenethylamine.",
            status: "supported",
            statusReason: "",
            supports: [makeSupport({ rationale: "First answer." })],
          },
          {
            claimKey: "pharmacology:pharmacology.pharmacodynamics",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: "2C-B is a psychedelic phenethylamine.",
            status: "needs_source",
            statusReason: "Second answer.",
            supports: [],
          },
        ],
      }),
    });

    expect(result.claims[0]).toMatchObject({
      status: "needs_review",
      referenceIds: [],
      supports: [],
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "conflicting_claim" }),
    ]));
  });

  it("accepts section-allowed recovered references that are not yet present on the article", () => {
    const context = createContext();
    context.sourcePacket.allowedReferences = [
      {
        id: "doi-10-1000-example",
        title: "Recovered paper",
        url: "https://doi.org/10.1000/example",
        doi: "10.1000/example",
        sourceIds: ["erowid"],
      },
    ];

    const result = parseFormalCitationSectionResponse({
      ...context,
      payload: makePayload({
        claims: [
          {
            claimKey: "pharmacology:pharmacology.pharmacodynamics",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: "2C-B is a psychedelic phenethylamine.",
            status: "supported",
            statusReason: "",
            supports: [makeSupport({
              referenceId: "doi-10-1000-example",
            })],
          },
        ],
      }),
    });

    expect(result.claims[0]).toMatchObject({
      status: "supported",
      referenceIds: ["doi-10-1000-example"],
    });
  });

  it("accepts one claim with many validated supports in deterministic reference order", () => {
    const context = createContext();
    context.article.references.push({
      id: "doi-10-1000-example",
      title: "Recovered paper",
      siteName: "Example Journal",
      url: "https://doi.org/10.1000/example",
      doi: "10.1000/example",
      sourceIds: ["erowid"],
    });

    const result = parseFormalCitationSectionResponse({
      ...context,
      payload: makePayload({
        claims: [
          {
            claimKey: "pharmacology:pharmacology.pharmacodynamics",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: "2C-B is a psychedelic phenethylamine.",
            status: "supported",
            statusReason: "",
            supports: [
              makeSupport(),
              makeSupport({
                referenceId: "doi-10-1000-example",
                rationale: "Source two.",
              }),
            ],
          },
        ],
      }),
    });

    expect(result.claims[0]).toMatchObject({
      status: "supported",
      referenceIds: ["doi-10-1000-example", "url-erowid-abc123"],
    });
    expect(result.claims[0].supports.map((support) => support.referenceId)).toEqual([
      "doi-10-1000-example",
      "url-erowid-abc123",
    ]);
  });

  it("downgrades a multi-support supported claim when any support fails strict validation", () => {
    const context = createContext();
    context.article.references.push({
      id: "doi-10-1000-example",
      title: "Recovered paper",
      siteName: "Example Journal",
      url: "https://doi.org/10.1000/example",
      doi: "10.1000/example",
      sourceIds: ["erowid"],
    });

    const result = parseFormalCitationSectionResponse({
      ...context,
      payload: makePayload({
        claims: [
          {
            claimKey: "pharmacology:pharmacology.pharmacodynamics",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: "2C-B is a psychedelic phenethylamine.",
            status: "supported",
            statusReason: "",
            supports: [
              makeSupport(),
              makeSupport({
                referenceId: "doi-10-1000-example",
                supportingQuote: "No such quote",
                rationale: "Source two.",
              }),
            ],
          },
        ],
      }),
    });

    expect(result.claims[0]).toMatchObject({
      status: "needs_review",
      referenceIds: ["url-erowid-abc123"],
    });
    expect(result.claims[0].diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "quote_not_found" }),
    ]));
  });
});
