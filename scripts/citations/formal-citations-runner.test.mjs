import { existsSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION } from "./formal-citations-contract.mjs";
import { runFormalCitationWorkflow } from "./formal-citations-runner.mjs";
import { buildFormalCitationTargets } from "./formal-citations-targets.mjs";

function createArticle() {
  return {
    id: "article-1",
    slug: "2c-b",
    title: "2C-B",
    pharmacology: {
      pharmacodynamics: "2C-B is a psychedelic phenethylamine.",
      pharmacokinetics: "",
    },
    legality: {
      countries: {
        us: {
          notes: "2C-B is controlled in the United States.",
        },
      },
    },
    references: [
      {
        id: "url-erowid-abc123",
        title: "Erowid 2C-B Vault",
        siteName: "Erowid",
        url: "https://www.erowid.org/chemicals/2cb/",
      },
    ],
  };
}

function makeArtifactsDir() {
  const dir = mkdtempSync(join(tmpdir(), "formal-citations-runner-"));
  return dir;
}

function createSectionResult(article, sectionKey) {
  const targets = buildFormalCitationTargets({ article, sectionKey });
  return {
    schemaVersion: FORMAL_CITATION_SECTION_RESPONSE_SCHEMA_VERSION,
    sectionKey,
    summary: `Summary for ${sectionKey}`,
    notes: [],
    targets,
    claims: targets.map((target) => ({
      claimKey: target.claimKey,
      fieldPath: target.fieldPath,
      claimText: target.claimText,
      status: "supported",
      originalStatus: "supported",
      statusReason: "",
      referenceIds: ["url-erowid-abc123"],
      supports: [{
        sourceId: "erowid",
        sourceName: "Erowid",
        referenceId: "url-erowid-abc123",
        sourceType: "experience_archive",
        quality: "low",
        supportingQuote: "Direct support.",
        rationale: "Bounded source support.",
        verifiedQuote: {
          sourceId: "erowid",
          matchType: "exact",
          startOffset: 0,
          endOffset: 15,
        },
      }],
      diagnostics: [],
    })),
    diagnostics: [],
    validationSummary: {
      targetCount: targets.length,
      emittedClaimCount: targets.length,
      diagnosticCount: 0,
      downgradedClaimCount: 0,
    },
    sourcePacket: {
      quoteDocument: "Quoted evidence",
      compiledSources: [
        {
          id: "erowid",
          displayName: "Erowid",
          excerpt: "Quoted evidence",
        },
      ],
      allowedReferences: [
        {
          id: "url-erowid-abc123",
          title: "Erowid 2C-B Vault",
          siteName: "Erowid",
          url: "https://www.erowid.org/chemicals/2cb/",
          sourceIds: ["erowid"],
        },
      ],
    },
    userMessage: `User prompt for ${sectionKey}`,
    systemPrompt: "System prompt",
    rawContent: JSON.stringify({ claims: [] }),
    finishReason: "stop",
    reasoning: null,
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formal citations runner", () => {
  it("writes per-section artifacts, progress, and merged draft before any write step", async () => {
    const article = createArticle();
    const artifactsDir = makeArtifactsDir();
    const runSection = vi.fn(async (sectionKey) => createSectionResult(article, sectionKey));
    const mergeDraft = vi.fn(({ article, sectionResults }) => ({
      slug: article.slug,
      title: article.title,
      article,
      changes: sectionResults.map((result) => ({ path: result.sectionKey })),
      references: article.references,
      evidence: [],
      gaps: [],
      preservedApproved: [],
      newSupport: [],
      proposedReplacements: [],
      staleEvidence: [],
      staleReferences: [],
    }));

    const workflow = await runFormalCitationWorkflow({
      article,
      articleSources: {},
      existingEvidence: [],
      sections: ["pharmacology", "legality"],
      options: {
        resume: false,
        write: false,
        refreshApproved: false,
        model: "anthropic/test-model",
        reasoningEffort: "high",
        disableReasoning: false,
        artifactsDir,
      },
      sourceUrl: "postgres://reader:secret@source.example/dosewiki?sslmode=require",
      runSection,
      mergeDraft,
      log: () => {},
    });

    expect(runSection).toHaveBeenCalledTimes(2);
    expect(mergeDraft).toHaveBeenCalledTimes(1);
    expect(workflow.summary.validatedSections).toEqual(["pharmacology", "legality"]);
    expect(existsSync(workflow.artifacts.progressPath)).toBe(true);
    expect(existsSync(workflow.artifacts.summaryPath)).toBe(true);
    expect(existsSync(workflow.artifacts.mergedDraftPath)).toBe(true);

    const pharmacologyPaths = workflow.artifacts.getSectionPaths("pharmacology");
    expect(existsSync(pharmacologyPaths.resultPath)).toBe(true);
    expect(existsSync(pharmacologyPaths.promptPath)).toBe(true);
    expect(existsSync(pharmacologyPaths.userMessagePath)).toBe(true);
    expect(existsSync(pharmacologyPaths.sourcePacketPath)).toBe(true);
    expect(existsSync(pharmacologyPaths.rawResponsePath)).toBe(true);

    const progress = JSON.parse(readFileSync(workflow.artifacts.progressPath, "utf8"));
    expect(progress.sections.pharmacology.status).toBe("merged");
    expect(progress.sections.legality.status).toBe("merged");
    expect(progress.merge.status).toBe("completed");
    expect(progress.sourceDeployment).toBe("source.example/dosewiki");
    expect(progress).not.toHaveProperty("sourceUrl");
    expect(JSON.stringify(progress)).not.toContain("reader:secret");
    expect(JSON.stringify(progress)).not.toContain("sslmode");
  });

  it("reuses validated section artifacts when resume is enabled", async () => {
    const article = createArticle();
    const artifactsDir = makeArtifactsDir();
    const firstRunSection = vi.fn(async (sectionKey) => createSectionResult(article, sectionKey));

    await runFormalCitationWorkflow({
      article,
      articleSources: {},
      existingEvidence: [],
      sections: ["pharmacology", "legality"],
      options: {
        resume: false,
        write: false,
        refreshApproved: false,
        model: "anthropic/test-model",
        reasoningEffort: "high",
        disableReasoning: false,
        artifactsDir,
      },
      sourceUrl: "postgres://reader:secret@source.example/dosewiki?sslmode=require",
      runSection: firstRunSection,
      mergeDraft: ({ article }) => ({
        slug: article.slug,
        title: article.title,
        article,
        changes: [],
        references: article.references,
        evidence: [],
        gaps: [],
        preservedApproved: [],
        newSupport: [],
        proposedReplacements: [],
        staleEvidence: [],
        staleReferences: [],
      }),
      log: () => {},
    });

    const resumedRunSection = vi.fn(async () => {
      throw new Error("resume should not rerun validated sections");
    });

    const resumedWorkflow = await runFormalCitationWorkflow({
      article,
      articleSources: {},
      existingEvidence: [],
      sections: ["pharmacology", "legality"],
      options: {
        resume: true,
        write: false,
        refreshApproved: false,
        model: "anthropic/test-model",
        reasoningEffort: "high",
        disableReasoning: false,
        artifactsDir,
      },
      sourceUrl: "postgres://reader:secret@source.example/dosewiki?sslmode=require",
      runSection: resumedRunSection,
      mergeDraft: ({ article, sectionResults }) => ({
        slug: article.slug,
        title: article.title,
        article,
        changes: sectionResults.map((result) => ({ path: result.sectionKey })),
        references: article.references,
        evidence: [],
        gaps: [],
        preservedApproved: [],
        newSupport: [],
        proposedReplacements: [],
        staleEvidence: [],
        staleReferences: [],
      }),
      log: () => {},
    });

    expect(resumedRunSection).not.toHaveBeenCalled();
    expect(resumedWorkflow.resumedSections).toEqual(["pharmacology", "legality"]);
    expect(resumedWorkflow.summary.outcomes).toEqual([
      expect.objectContaining({ sectionKey: "pharmacology", status: "resumed" }),
      expect.objectContaining({ sectionKey: "legality", status: "resumed" }),
    ]);
  });
});
