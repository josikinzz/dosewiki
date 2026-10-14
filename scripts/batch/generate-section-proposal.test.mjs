import { describe, expect, it } from "vitest";

import { generateSectionProposal, parseProposalArgs } from "./generate-section-proposal.mjs";

const postgresApi = {
  substanceIndex: { getBySlug: "substanceIndex.getBySlug" },
  prompts: { getByKey: "prompts.getByKey" },
  quotes: { getBySlugAndSection: "quotes.getBySlugAndSection" },
  articleSources: { getBySlug: "articleSources.getBySlug" },
};

const sourceArticle = {
  _id: "source-article",
  _creationTime: 1,
  id: 22,
  slug: "2c-b",
  title: "2C-B",
  summary: "source deployment summary",
  classification: { psychoactive_class: ["psychedelic"], chemical_class: ["phenethylamine"] },
  pharmacology: { pharmacodynamics: "source pharmacology" },
  dosage: { routes: [{ route: "Oral", bioavailability: "" }] },
  duration: { routes: [{ route: "Oral", half_life: "" }] },
};
const targetArticle = {
  _id: "target-article",
  _creationTime: 2,
  id: 22,
  slug: "2c-b",
  title: "2C-B",
  summary: "target deployment summary",
  classification: { psychoactive_class: ["psychedelic"], chemical_class: ["phenethylamine"] },
  pharmacology: { pharmacodynamics: "target pharmacology" },
  dosage: { routes: [{ route: "Oral", bioavailability: "" }] },
  duration: { routes: [{ route: "Oral", half_life: "" }] },
};
const prompt = {
  _id: "prompt",
  _creationTime: 3,
  key: "section_summary",
  content: "exact prompt bytes\n  retained\n",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const quote = {
  _id: "quote",
  _creationTime: 4,
  slug: "2c-b",
  section: "summary",
  content: "exact excerpt bytes\n  retained\n",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const rawResponse = `summary: "2C-B is a psychedelic phenethylamine known for a distinct balance of sensory alteration, emotional openness, and relatively clear cognition. Its effects vary with dose, setting, individual sensitivity, and route, and careful preparation remains important because responses can differ substantially between people and occasions."`;

class FakeClient {
  constructor(url) {
    this.url = url;
  }

  async query(reference) {
    if (reference === postgresApi.substanceIndex.getBySlug) {
      return this.url.includes("source-") ? sourceArticle : targetArticle;
    }
    if (reference === postgresApi.prompts.getByKey) {
      return prompt;
    }
    if (reference === postgresApi.quotes.getBySlugAndSection) {
      return quote;
    }
    if (reference === postgresApi.articleSources.getBySlug) return null;
    throw new Error(`Unexpected query: ${reference}`);
  }

  async mutation() {
    throw new Error("Proposal generation must never call mutation().");
  }
}

describe("review-only section proposal orchestration", () => {
  it("fails closed for --write, missing explicit target, and a mismatched target article", async () => {
    expect(() => parseProposalArgs(["--slug=2c-b", "--section=summary", "--write"])).toThrow(/forbidden/);

    await expect(generateSectionProposal({
      argv: ["--slug=2c-b", "--section=summary", "--source-url=postgresql://localhost/source-test"],
      env: { DATA_BACKEND: "postgres", POSTGRES_DIRECT_URL: "postgresql://localhost/browser-default", POSTGRES_POOLED_URL: "postgresql://localhost/browser" },
      Client: FakeClient,
      postgresApi,
      loadsEnvLocal: false,
      callOpenRouter: async () => ({ content: rawResponse }),
    })).rejects.toThrow(/explicit proposal target/);

    class WrongTargetArticleClient extends FakeClient {
      async query(reference, args) {
        const result = await super.query(reference, args);
        if (reference === postgresApi.substanceIndex.getBySlug && !this.url.includes("source-")) {
          return { ...result, slug: "lsd" };
        }
        return result;
      }
    }

    await expect(generateSectionProposal({
      argv: [
        "--slug=2c-b",
        "--section=summary",
        "--source-url=postgresql://localhost/source-test",
        "--target=postgresql://localhost/target-test",
      ],
      env: { DATA_BACKEND: "postgres",},
      Client: WrongTargetArticleClient,
      postgresApi,
      loadsEnvLocal: false,
      callOpenRouter: async () => ({ content: rawResponse }),
    })).rejects.toThrow(/Target article identity mismatch/);
  });
});
