import { describe, expect, it } from "vitest";

import { CONFIG } from "../summary/config.mjs";
import {
  buildGenericSourceUserMessage,
  buildSummaryQuoteUserMessage,
} from "../summary/source-material.mjs";
import { loadSummaryProposalInputs } from "./summary-adapter.mjs";

const api = {
  prompts: { getByKey: "prompts.getByKey" },
  quotes: { getBySlugAndSection: "quotes.getBySlugAndSection" },
  articleSources: { getBySlug: "articleSources.getBySlug" },
};
const article = {
  title: "2C-B",
  classification: {
    psychoactive_class: ["psychedelic"],
    chemical_class: ["phenethylamine"],
  },
};
const prompt = {
  _id: "prompt-id",
  _creationTime: 1,
  key: "section_summary",
  content: "system prompt\nwith exact bytes  \n",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function clientFor({ quote = null, source = null, calls = [] }) {
  return {
    async query(reference) {
      calls.push(reference);
      if (reference === api.prompts.getByKey) return prompt;
      if (reference === api.quotes.getBySlugAndSection) return quote;
      if (reference === api.articleSources.getBySlug) return source;
      throw new Error(`Unexpected query ${reference}`);
    },
  };
}

describe("summary proposal adapter", () => {
  it("uses quote-first precedence and the current summary quote message exactly", async () => {
    const calls = [];
    const quote = { _id: "quote-id", slug: "2c-b", section: "summary", content: "quote bytes\n  exact" };
    const result = await loadSummaryProposalInputs({
      sourceClient: clientFor({ quote, calls }),
      api,
      slug: "2c-b",
      sourceArticle: article,
    });

    expect(result.userMessage).toBe(buildSummaryQuoteUserMessage(article, quote.content));
    expect(result.promptRecord).toEqual(prompt);
    expect(result.sourceMaterial.record).toEqual(quote);
    expect(result.sourceMaterial.excerpts[0].includedContent).toBe(quote.content);
    expect(calls).not.toContain(api.articleSources.getBySlug);
  });

  it("falls back to normalized generic sources with the current message and exact excerpts", async () => {
    const source = {
      _id: "source-id",
      _creationTime: 2,
      slug: "2c-b",
      substanceName: "2C-B",
      sources: [{ id: "primary", fileName: "source.md", displayName: "Primary", size: 20, tokens: 4 }],
      contents: { primary: "first line\nsecond line  \n" },
    };
    const result = await loadSummaryProposalInputs({
      sourceClient: clientFor({ source }),
      api,
      slug: "2c-b",
      sourceArticle: article,
      config: CONFIG,
    });

    expect(result.userMessage).toBe(buildGenericSourceUserMessage(article, result.sourceMaterial.record, CONFIG));
    expect(result.sourceMaterial.kind).toBe("generic_sources");
    expect(result.sourceMaterial.excerpts[0].rawContent).toBe(source.contents.primary);
    expect(result.sourceMaterial.excerpts[0].includedContent).toBe(source.contents.primary);
  });
});
