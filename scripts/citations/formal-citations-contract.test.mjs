import { describe, expect, it } from "vitest";

import {
  FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
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
});
