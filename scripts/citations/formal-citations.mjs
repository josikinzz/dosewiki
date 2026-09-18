#!/usr/bin/env node

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireSourceUrl,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import {
  DEFAULT_FORMAL_CITATIONS_MODEL,
  DEFAULT_REASONING_EFFORT,
  loadFormalCitationPrompts,
  parseFormalCitationsOptions,
  resolveRequestedFormalCitationSections,
  runFormalCitationSectionAgent,
} from "./formal-citations-agent.mjs";
import { buildFormalCitationDraftFromAgent } from "./formal-citations-core.mjs";
import { writeFormalCitationWriteResultArtifact } from "./formal-citations-artifacts.mjs";
import { runFormalCitationWorkflow } from "./formal-citations-runner.mjs";
import { buildFormalCitationPromotionPlan } from "./formal-citations-promotion.mjs";
import { applyCitationPromotionPlan } from "./citation-promotion-applicator.mjs";

const argv = process.argv.slice(2);
const options = parseFormalCitationsOptions(argv);

function printHelp() {
  console.log(`
Run the formal citations section agent one section at a time.

Usage:
  OPENROUTER_API_KEY=... npm run citations:formal -- --slug=2c-b
  OPENROUTER_API_KEY=... npm run citations:formal -- --slug=2c-b --section=pharmacology
  OPENROUTER_API_KEY=... npm run citations:formal -- --slug=2c-b --sections=pharmacology,legality --no-resume
  OPENROUTER_API_KEY=... npm run citations:formal -- --slug=2c-b --write --confirm-citation-write

Options:
  --slug=<slug>                 Article slug (default: 2c-b)
  --section=<key>               Run one section
  --sections=<a,b>              Run a comma-separated section list
  --resume                      Reuse completed per-section artifacts when available (default)
  --no-resume                   Ignore prior section progress and rerun selected sections
  --artifacts-dir=<path>        Override the formal citations artifact root
  --model=<id>                  OpenRouter model override
  --reasoning-effort=<level>    Reasoning effort override
  --disable-reasoning           Disable reasoning mode for the model call
  --wikipedia-enrichment=off    Disable live Wikipedia source enrichment
  --refresh-approved            Refresh approved in-scope rows; stale selected evidence is still preserved
  --replace-approved            Refresh approved in-scope rows and delete stale selected evidence on write
  --write                       Persist the merged draft to Postgres
  --confirm-citation-write      Required with --write
  --help, -h                    Show this help message
`);
}

const runContext = createDataOpsRunContext({
  operation: "formal claim-level citations",
  intent: "citation-pilot",
  argv,
  dryRunFlag: "--dry-run",
  executeFlag: "--write",
  requiresExecute: true,
  confirmationFlag: "--confirm-citation-write",
  selectedTables: ["substanceIndex", "articleSources", "quotes", "citationEvidence", "prompts"],
  destructive: true,
});

if (!options.write) {
  runContext.dryRun = true;
  runContext.writeEnabled = false;
}

function redactArticleForDiff(article) {
  return {
    slug: article.slug,
    title: article.title,
    references: article.references,
    dosageRouteReferences: article.dosage?.routes?.map((route) => ({
      route: route.route,
      reference_ids: route.reference_ids ?? [],
    })),
    durationRouteReferences: article.duration?.routes?.map((route) => ({
      route: route.route,
      reference_ids: route.reference_ids ?? [],
    })),
  };
}

function requireOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required for formal citations agent runs.");
  }
  return apiKey;
}

function describeApprovedWriteMode(mode) {
  switch (mode) {
    case "refresh":
      return "refresh approved rows in-scope; preserve stale selected evidence";
    case "replace":
      return "replace approved rows in-scope; delete stale selected evidence on write";
    default:
      return "preserve approved rows";
  }
}

async function main() {
  if (options.help) {
    printHelp();
    return;
  }

  printDataOpsRunContext(runContext);
  console.log(`Slug: ${options.slug}`);
  console.log(`Approved evidence policy: ${describeApprovedWriteMode(options.approvedWriteMode)}`);
  console.log(`Model: ${options.model || DEFAULT_FORMAL_CITATIONS_MODEL}`);
  console.log(`Reasoning: ${options.disableReasoning ? "disabled" : (options.reasoningEffort ?? DEFAULT_REASONING_EFFORT)}`);
  console.log(`Resume: ${options.resume ? "enabled" : "disabled"}`);
  console.log(`Wikipedia enrichment: ${options.wikipediaEnrichment ? "enabled" : "disabled"}`);

  const sourceUrl = requireSourceUrl(runContext, "Postgres citation source URL");
  const sourceClient = createDataClient({ target: sourceUrl }).client;
  const article = await sourceClient.query(api.substanceIndex.getBySlug, { slug: options.slug });
  if (!article) throw new Error(`No article found for slug: ${options.slug}`);

  const sections = resolveRequestedFormalCitationSections({ article, options });
  console.log(`Sections: ${sections.join(", ")}`);
  console.log("");

  const citationReviewToken = requireAdminIntentToken("citationEvidenceReview");

  const [articleSources, existingEvidence, prompts] = await Promise.all([
    sourceClient.query(api.articleSources.getBySlug, {
      slug: options.slug,
      apiKey: process.env.DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION ?? process.env.DATA_ADMIN_KEY,
    }),
    sourceClient.query(api.citationEvidence.getBySlug, {
      apiKey: citationReviewToken.token,
      slug: options.slug,
    }),
    loadFormalCitationPrompts(sourceClient, sections),
  ]);

  const workflow = await runFormalCitationWorkflow({
    article,
    articleSources,
    existingEvidence,
    sections,
    options,
    sourceUrl,
    targetUrl: options.write ? requireTargetUrl(runContext, "Postgres citation write target URL") : null,
    runSection: async (sectionKey) => {
      const apiKey = requireOpenRouterApiKey();
      console.log(`Running section agent: ${sectionKey}`);
      return runFormalCitationSectionAgent({
        apiKey,
        sourceClient,
        article,
        articleSources,
        sectionKey,
        model: options.model,
        reasoningEffort: options.reasoningEffort,
        disableReasoning: options.disableReasoning,
        wikipediaEnrichment: options.wikipediaEnrichment,
        prompts,
      }).then((result) => ({
        ...result,
        systemPrompt: prompts.formal_citations_agent,
      }));
    },
    mergeDraft: ({ article, articleSources, existingEvidence, sectionResults }) =>
      buildFormalCitationDraftFromAgent({
        article,
        articleSources,
        existingEvidence,
        sectionResults,
        approvedWriteMode: options.approvedWriteMode,
      }),
  });

  console.log("Section execution summary");
  console.log(JSON.stringify(workflow.summary.outcomes, null, 2));
  console.log("");

  if (!workflow.draft) {
    console.log("No merged draft was produced. See section artifacts for failures or skipped sections.");
    console.log(`Artifacts: ${workflow.artifacts.rootDir}`);
    return;
  }

  const draft = workflow.draft;
  console.log("Dry-run/draft summary");
  console.log(JSON.stringify({
    slug: draft.slug,
    title: draft.title,
    changedFields: draft.changes.length,
    references: draft.references.length,
    evidenceRows: draft.evidence.length,
    gaps: draft.gaps.length,
    preservedApproved: draft.preservedApproved.length,
    newSupport: draft.newSupport.length,
    proposedReplacements: draft.proposedReplacements.length,
    staleEvidence: draft.staleEvidence.length,
    staleReferences: draft.staleReferences.length,
    validatedSections: workflow.summary.validatedSections,
    resumedSections: workflow.summary.resumedSections,
    failedSections: workflow.summary.failedSections.map((entry) => entry.sectionKey),
    skippedSections: workflow.summary.skippedSections.map((entry) => entry.sectionKey),
    artifacts: workflow.summary.artifacts,
  }, null, 2));
  console.log("");

  console.log("Proposed article field changes");
  console.log(JSON.stringify(draft.changes, null, 2));
  console.log("");

  console.log("Reference entries");
  console.log(JSON.stringify(draft.references.map((reference) => ({
    id: reference.id,
    title: reference.title,
    url: reference.url,
    sourceType: reference.sourceType,
    quality: reference.quality,
  })), null, 2));
  console.log("");

  console.log("Evidence rows");
  console.log(JSON.stringify(draft.evidence.map((row) => ({
    claimKey: row.claimKey,
    fieldPath: row.fieldPath,
    referenceIds: row.referenceIds,
    status: row.status,
    statusReason: row.statusReason,
    severity: row.severity,
    confidence: row.confidence,
    supports: Array.isArray(row.supports)
      ? row.supports.map((support) => ({
          referenceId: support.referenceId,
          sourceId: support.sourceId,
          sourceName: support.sourceName,
          snippet: support.supportingQuote,
        }))
      : [],
  })), null, 2));
  console.log("");

  if (draft.gaps.length > 0) {
    console.log("Citation gaps");
    console.log(JSON.stringify(draft.gaps, null, 2));
    console.log("");
  }

  if (draft.preservedApproved.length > 0) {
    console.log("Preserved approved evidence");
    console.log(JSON.stringify(draft.preservedApproved, null, 2));
    console.log("");
  }

  if (draft.newSupport.length > 0) {
    console.log("New support");
    console.log(JSON.stringify(draft.newSupport, null, 2));
    console.log("");
  }

  if (draft.proposedReplacements.length > 0) {
    console.log("Proposed replacements");
    console.log(JSON.stringify(draft.proposedReplacements, null, 2));
    console.log("");
  }

  if (draft.staleReferences.length > 0) {
    console.log("Stale references");
    console.log(JSON.stringify(draft.staleReferences, null, 2));
    console.log("");
  }

  if (draft.staleEvidence.length > 0) {
    console.log("Stale evidence");
    console.log(JSON.stringify(draft.staleEvidence, null, 2));
    console.log("");
  }

  console.log("Article reference patch preview");
  console.log(JSON.stringify(redactArticleForDiff(draft.article), null, 2));
  console.log("");

  if (!options.write) {
    console.log(`Artifacts: ${workflow.artifacts.rootDir}`);
    console.log("No writes performed. Re-run with --write --confirm-citation-write to update Postgres.");
    return;
  }

  if (workflow.failedSections.length > 0) {
    console.log(`Artifacts: ${workflow.artifacts.rootDir}`);
    console.log("No writes performed because one or more selected sections failed. Resume after reviewing the saved section artifacts.");
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  const targetUrl = requireTargetUrl(runContext, "Postgres citation write target URL");
  const targetClient = createDataClient({ target: targetUrl }).client;
  const citationWriteToken = requireAdminIntentToken("citationEvidenceWrite");
  const promotionPlan = buildFormalCitationPromotionPlan({
    draft,
    slug: options.slug,
    approvedWriteMode: options.approvedWriteMode,
  });
  const writeResult = await applyCitationPromotionPlan({
    client: targetClient,
    apiKey: citationWriteToken.token,
    plan: promotionPlan,
  });

  writeFormalCitationWriteResultArtifact({
    artifacts: workflow.artifacts,
    writeResult: {
      recordedAt: new Date().toISOString(),
      slug: options.slug,
      approvedWriteMode: options.approvedWriteMode,
      tokenSources: {
        review: citationReviewToken.source,
        write: citationWriteToken.source,
      },
      result: writeResult,
    },
  });

  console.log("Write results");
  console.log(JSON.stringify({
    approvedWriteMode: options.approvedWriteMode,
    articleResult: writeResult.article,
    evidenceResult: writeResult.evidence,
  }, null, 2));
  console.log("");
  console.log(`Artifacts: ${workflow.artifacts.rootDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
