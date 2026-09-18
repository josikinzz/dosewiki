import { describe, expect, it } from "vitest";

import {
  buildFormalCitationSourcePacket,
  buildFormalCitationUserMessage,
  DEFAULT_FORMAL_CITATIONS_MODEL,
  DEFAULT_REASONING_EFFORT,
  extractJsonObject,
  parseFormalCitationsOptions,
  resolveRequestedFormalCitationSections,
  runFormalCitationSectionAgent,
} from "./formal-citations-agent.mjs";
import {
  FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
  parseFormalCitationSectionResponse,
} from "./formal-citations-contract.mjs";
import {
  formalCitationSectionKeyToPromptKey,
  getFormalCitationAgentPromptDescriptor,
} from "../lib/prompt-registry.mjs";

describe("formal citations agent surface", () => {
  it("uses the DeepSeek default model with high reasoning and allows --model override", () => {
    expect(parseFormalCitationsOptions([])).toMatchObject({
      model: DEFAULT_FORMAL_CITATIONS_MODEL,
      reasoningEffort: DEFAULT_REASONING_EFFORT,
    });
    expect(DEFAULT_FORMAL_CITATIONS_MODEL).toBe("deepseek/deepseek-v4-pro");
    expect(DEFAULT_REASONING_EFFORT).toBe("high");

    expect(parseFormalCitationsOptions([
      "--model=anthropic/claude-opus-4.5",
    ])).toMatchObject({
      model: "anthropic/claude-opus-4.5",
      reasoningEffort: "high",
    });
  });

  it("parses explicit model, reasoning, and section controls", () => {
    const options = parseFormalCitationsOptions([
      "--slug=2c-b",
      "--model=anthropic/claude-opus-4.5",
      "--reasoning-effort=medium",
      "--section=pharmacology",
      "--sections=legality,tolerance",
      "--no-resume",
      "--artifacts-dir=/tmp/formal-citations",
      "--wikipedia-enrichment=off",
      "--write",
      "--refresh-approved",
    ]);

    expect(options).toMatchObject({
      slug: "2c-b",
      model: "anthropic/claude-opus-4.5",
      reasoningEffort: "medium",
      section: "pharmacology",
      sections: ["legality", "tolerance"],
      resume: false,
      artifactsDir: "/tmp/formal-citations",
      wikipediaEnrichment: false,
      write: true,
      approvedWriteMode: "refresh",
      refreshApproved: true,
    });
  });

  it("treats replace-approved as a distinct write mode", () => {
    const options = parseFormalCitationsOptions([
      "--replace-approved",
    ]);

    expect(options).toMatchObject({
      approvedWriteMode: "replace",
      refreshApproved: true,
      replaceApproved: true,
    });
  });

  it("normalizes default section selection and omits empty tolerance", () => {
    const article = {
      tolerance: {
        full_tolerance: "",
        half_tolerance: "",
        baseline_tolerance: "",
        cross_tolerance: [],
      },
    };

    expect(resolveRequestedFormalCitationSections({
      article,
      options: parseFormalCitationsOptions([]),
    })).toEqual([
      "summary",
      "pharmacology",
      "harm_potential",
      "legality",
      "history_culture",
    ]);
  });

  it("builds a bounded source packet and prompt message for one section", async () => {
    const article = {
      slug: "2c-b",
      title: "2C-B",
      pharmacology: {
        pharmacodynamics: "2C-B is a psychedelic phenethylamine.",
      },
      references: [
        { id: "url-erowid-abc123", title: "Erowid", siteName: "Erowid", url: "https://erowid.org/chemicals/2cb/" },
      ],
    };
    const targets = [{
      claimKey: "pharmacology:pharmacology.pharmacodynamics",
      fieldPath: "pharmacology.pharmacodynamics",
      claimText: "2C-B is a psychedelic phenethylamine.",
    }];
    const sourcePacket = await buildFormalCitationSourcePacket({
      article,
      sectionKey: "pharmacology",
      quoteDocument: "Quoted pharmacology evidence",
      articleSources: {
        sources: [
          { id: "erowid", displayName: "Erowid", fileName: "erowid.md" },
        ],
        contents: {
          erowid: "Pharmacology notes about receptor activity and metabolism.",
        },
      },
      fetchImpl: null,
    });

    const userMessage = buildFormalCitationUserMessage({
      article,
      sectionKey: "pharmacology",
      sectionPrompt: "Evaluate pharmacology claims conservatively.",
      targets,
      sourcePacket,
    });

    expect(sourcePacket.compiledSources).toHaveLength(1);
    expect(sourcePacket.allowedReferences).toEqual([
      expect.objectContaining({
        id: "url-erowid-abc123",
      }),
    ]);
    expect(userMessage).toContain("SECTION_ARTICLE_SNAPSHOT");
    expect(userMessage).toContain("TARGETS");
    expect(userMessage).toContain("COMPILED_SOURCE_PACKET");
    expect(userMessage).toContain("ALLOWED_REFERENCES");
    expect(userMessage).toContain("QUOTE_CORPUS");
    expect(userMessage).toContain("WIKIPEDIA_CITATION_PACKET");
  });

  it("extracts fenced JSON and includes the explicit section response contract in the prompt", () => {
    const payload = extractJsonObject(`\`\`\`json
{"schemaVersion":"${FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION}","sectionKey":"pharmacology","claims":[{"claimKey":"pharmacology:pharmacology.pharmacodynamics","fieldPath":"pharmacology.pharmacodynamics","claimText":"Claim A","status":"needs_source","sourceId":null,"sourceName":null,"referenceId":null,"supportingQuote":"","rationale":"No direct support."}]}
\`\`\``);
    const claims = parseFormalCitationSectionResponse({
      payload,
      sectionKey: "pharmacology",
      article: {
        slug: "2c-b",
        title: "2C-B",
        references: [
          { id: "url-erowid-abc123", title: "Erowid", siteName: "Erowid", url: "https://erowid.org/chemicals/2cb/" },
        ],
      },
      articleSources: {
        contents: {
          erowid: "Direct quote",
        },
      },
      sourcePacket: {
        compiledSources: [
          { id: "erowid", displayName: "Erowid", excerpt: "Direct quote" },
        ],
      },
      targets: [
        {
          claimKey: "pharmacology:pharmacology.pharmacodynamics",
          fieldPath: "pharmacology.pharmacodynamics",
          claimText: "Claim A",
        },
      ],
    });

    expect(claims.claims).toEqual([
      expect.objectContaining({
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        status: "needs_source",
      }),
    ]);
    expect(claims.schemaVersion).toBe(FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION);
  });

  it("renders the explicit schema contract into the section prompt", () => {
    const article = {
      slug: "2c-b",
      title: "2C-B",
      references: [],
      pharmacology: {
        pharmacodynamics: "2C-B is a psychedelic phenethylamine.",
      },
    };
    const targets = [{
      claimKey: "pharmacology:pharmacology.pharmacodynamics",
      fieldPath: "pharmacology.pharmacodynamics",
      claimText: "2C-B is a psychedelic phenethylamine.",
    }];
    const sourcePacket = {
      quoteDocument: "",
      compiledSources: [],
    };

    const userMessage = buildFormalCitationUserMessage({
      article,
      sectionKey: "pharmacology",
      sectionPrompt: "Evaluate pharmacology claims conservatively.",
      targets,
      sourcePacket,
    });

    expect(userMessage).toContain("SECTION_RESPONSE_CONTRACT");
    expect(userMessage).toContain(FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION);
    expect(userMessage).toContain('"supports": [');
    expect(userMessage).toContain('"referenceId": "<allowed reference id>"');
  });

  it("runs one section end to end through source packet building, model parsing, and fail-closed validation", async () => {
    const article = {
      slug: "2c-b",
      title: "2C-B",
      references: [
        {
          id: "url-erowid-abc123",
          title: "Erowid",
          siteName: "Erowid",
          url: "https://erowid.org/chemicals/2cb/",
        },
      ],
      pharmacology: {
        pharmacodynamics: "2C-B is a psychedelic phenethylamine.",
      },
    };
    const prompts = {
      [getFormalCitationAgentPromptDescriptor().dataKey]: "System prompt",
      [formalCitationSectionKeyToPromptKey("pharmacology")]: "Evaluate pharmacology claims conservatively.",
    };
    const sourceClient = {
      query: async () => "",
    };
    const result = await runFormalCitationSectionAgent({
      apiKey: "test-key",
      sourceClient,
      article,
      articleSources: {
        sources: [
          { id: "erowid", displayName: "Erowid", fileName: "erowid.md" },
        ],
        contents: {
          erowid: "2C-B is a psychedelic phenethylamine with serotonin receptor activity.",
        },
      },
      sectionKey: "pharmacology",
      model: "anthropic/test-model",
      reasoningEffort: "medium",
      prompts,
      callChat: async ({ userMessage: _userMessage }) => ({
        content: `\`\`\`json
${JSON.stringify({
  schemaVersion: FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
  sectionKey: "pharmacology",
  summary: "Validated one pharmacology claim.",
  notes: [],
  claims: [
    {
      claimKey: "pharmacology:pharmacology.pharmacodynamics",
      fieldPath: "pharmacology.pharmacodynamics",
      claimText: "2C-B is a psychedelic phenethylamine.",
      status: "supported",
      statusReason: "",
      supports: [
        {
          sourceId: "erowid",
          sourceName: "Erowid",
          referenceId: "url-erowid-abc123",
          supportingQuote: "2C-B is a psychedelic phenethylamine",
          rationale: "The bounded source states this directly.",
        },
      ],
    },
  ],
}, null, 2)}
\`\`\``,
        finishReason: "stop",
        reasoning: null,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      }),
    });

    expect(result).toMatchObject({
      sectionKey: "pharmacology",
      summary: "Validated one pharmacology claim.",
      claims: [
        expect.objectContaining({
          claimKey: "pharmacology:pharmacology.pharmacodynamics",
          status: "supported",
          referenceIds: ["url-erowid-abc123"],
        }),
      ],
      validationSummary: expect.objectContaining({
        targetCount: 1,
        downgradedClaimCount: 0,
      }),
    });
    expect(result.userMessage).toContain("QUOTE_CORPUS");
    expect(result.sourcePacket.allowedReferences).toEqual([
      expect.objectContaining({ id: "url-erowid-abc123" }),
    ]);
  });
});
