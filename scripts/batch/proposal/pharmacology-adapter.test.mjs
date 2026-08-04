import { describe, expect, it } from "vitest";

import { sha256Text } from "./core.mjs";
import {
  loadPharmacologyProposalInputs,
  pharmacologyProposalAdapter,
} from "./pharmacology-adapter.mjs";
import { sectionProposalAdapters } from "./section-adapters.mjs";
import { summaryProposalAdapter } from "./summary-adapter.mjs";
import { buildUserMessage } from "../pharmacology/parser.mjs";

const api = {
  prompts: { getByKey: "prompts.getByKey" },
  quotes: { getBySlugAndSection: "quotes.getBySlugAndSection" },
};
const sourceArticle = {
  title: "2C-B",
  classification: {
    psychoactive_class: ["psychedelic"],
    chemical_class: ["phenethylamine"],
  },
};
const promptRecord = {
  _id: "pharmacology-prompt",
  _creationTime: 1,
  key: "section_pharmacology",
  content: "exact pharmacology prompt bytes\n  retained\n",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const quoteRecord = {
  _id: "pharmacology-quote",
  _creationTime: 2,
  slug: "2c-b",
  section: "pharmacology",
  content: "exact source excerpt bytes\n  retained\n",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function sourceClient({ prompt = promptRecord, quote = quoteRecord, calls = [] } = {}) {
  return {
    async query(reference, args) {
      calls.push({ reference, args });
      if (reference === api.prompts.getByKey) return prompt;
      if (reference === api.quotes.getBySlugAndSection) return quote;
      throw new Error(`Unexpected query: ${reference}`);
    },
  };
}

describe("pharmacology proposal adapter", () => {
  it("resolves the live pharmacology prompt and exact source excerpt with full provenance", async () => {
    const calls = [];
    const result = await loadPharmacologyProposalInputs({
      sourceClient: sourceClient({ calls }),
      api,
      slug: "2c-b",
      sourceArticle,
    });

    expect(calls).toEqual(expect.arrayContaining([
      { reference: api.prompts.getByKey, args: { key: "section_pharmacology" } },
      {
        reference: api.quotes.getBySlugAndSection,
        args: { slug: "2c-b", section: "pharmacology" },
      },
    ]));
    expect(result.promptKey).toBe("section_pharmacology");
    expect(result.promptRecord).toEqual(promptRecord);
    expect(result.systemMessage).toBe(promptRecord.content);
    expect(result.userMessage).toBe(buildUserMessage(sourceArticle, quoteRecord.content));
    expect(result.sourceMaterial).toMatchObject({
      kind: "quotes",
      record: quoteRecord,
      excerpts: [{
        sourceId: "pharmacology-quote",
        includedContent: quoteRecord.content,
        includedContentHash: sha256Text(quoteRecord.content),
        truncated: false,
      }],
    });
  });

  it("fails closed when the source prompt or pharmacology excerpt cannot be resolved", async () => {
    await expect(loadPharmacologyProposalInputs({
      sourceClient: sourceClient({ prompt: null }),
      api,
      slug: "2c-b",
      sourceArticle,
    })).rejects.toThrow(/section_pharmacology prompt not found/);

    await expect(loadPharmacologyProposalInputs({
      sourceClient: sourceClient({ quote: null }),
      api,
      slug: "2c-b",
      sourceArticle,
    })).rejects.toThrow(/quote doc not found/);

    await expect(loadPharmacologyProposalInputs({
      sourceClient: sourceClient({ quote: { ...quoteRecord, content: "   " } }),
      api,
      slug: "2c-b",
      sourceArticle,
    })).rejects.toThrow(/has no content/);

    await expect(loadPharmacologyProposalInputs({
      sourceClient: sourceClient({ prompt: { ...promptRecord, key: "section_summary" } }),
      api,
      slug: "2c-b",
      sourceArticle,
    })).rejects.toThrow(/prompt identity mismatch/);

    await expect(loadPharmacologyProposalInputs({
      sourceClient: sourceClient({ quote: { ...quoteRecord, slug: "lsd" } }),
      api,
      slug: "2c-b",
      sourceArticle,
    })).rejects.toThrow(/quote doc identity/);
  });

  it("reuses the standard parser while preserving summary and pharmacology registrations", () => {
    const parsed = pharmacologyProposalAdapter.parseGeneratedValue(`pharmacology:\n  pharmacodynamics: "5-HT2A partial agonist"\n  binding_sites: []\n  pharmacokinetics: "Hepatic metabolism"\n  metabolites: []\n  route_bioavailability: {}\n  route_half_life: {}`);

    expect(parsed).toMatchObject({
      pharmacodynamics: "5-HT2A partial agonist",
      pharmacokinetics: "Hepatic metabolism",
      binding_sites: [],
      metabolites: [],
    });
    expect(pharmacologyProposalAdapter.publicationProfile).toBe("pharmacology");
    expect(pharmacologyProposalAdapter.publicationFields).toEqual([
      "pharmacology",
      "dosage",
      "duration",
    ]);
    expect(sectionProposalAdapters.summary).toBe(summaryProposalAdapter);
    expect(sectionProposalAdapters.pharmacology).toBe(pharmacologyProposalAdapter);
  });
});
