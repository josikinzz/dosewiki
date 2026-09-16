#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BackendClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  createBatchProposalReadContext,
  requireBatchProposalTargetUrl,
  requireBatchSourceUrl,
} from "./lib/batch-targets.mjs";
import {
  attachManifestDigest,
  buildSectionProposal,
  canonicalHash,
  deploymentFingerprint,
  proposalOutputDirectory,
  sha256Text,
  topLevelFieldHashes,
  writeImmutableManifest,
  writeProposalArtifacts,
  writeRawResponseArtifact,
} from "./proposal/core.mjs";
import { createProposalReadApi, createQueryOnlyPostgresClient } from "./proposal/read-only-postgres.mjs";
import {
  getSectionProposalAdapter,
  sectionProposalAdapters,
} from "./proposal/section-adapters.mjs";
import { stripDataMetadata } from "./summary/articles.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUTPUT_ROOT = resolve(PROJECT_ROOT, "notes-and-plans/exports/batch-proposals");

function valuesForFlag(argv, name) {
  const prefix = `${name}=`;
  return argv.filter((entry) => entry.startsWith(prefix)).map((entry) => entry.slice(prefix.length));
}

export function parseProposalArgs(argv) {
  if (argv.includes("--write") || argv.some((entry) => entry.startsWith("--write="))) {
    throw new Error("--write is forbidden: batch:proposal is review-only and cannot write Postgres.");
  }

  const known = new Set(["--help", "-h", "--allow-remote"]);
  for (const argument of argv) {
    if (known.has(argument)) continue;
    if (["--slug=", "--section=", "--source-url=", "--target="].some((prefix) => argument.startsWith(prefix))) continue;
    throw new Error(`Unknown argument: ${argument}`);
  }

  const slugs = valuesForFlag(argv, "--slug");
  const sections = valuesForFlag(argv, "--section");
  if (slugs.length !== 1 || !slugs[0].trim()) {
    throw new Error("Exactly one non-empty --slug=<slug> is required.");
  }
  if (sections.length !== 1 || !sections[0].trim()) {
    throw new Error("Exactly one non-empty --section=<section> is required.");
  }

  return {
    slug: slugs[0].trim(),
    section: sections[0].trim(),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

export function proposalHelpText() {
  const supportedSections = Object.keys(sectionProposalAdapters).join("|");
  return `Review-only section regeneration proposal\n\n` +
    `Usage:\n  DATA_BACKEND=postgres npm run batch:proposal -- --slug=<slug> --section=<${supportedSections}> --source-url=<url> --target=<url>\n\n` +
    `Source identity comes from --source-url or SOURCE_POSTGRES_URL, otherwise the selected target. ` +
    `Target identity must come from --target or TARGET_POSTGRES_URL. ` +
    `Remote access requires --allow-remote and POSTGRES_IMPORT_CONFIRM=<hostname>. ` +
    `This command never accepts --write and never calls a Postgres mutation.\n`;
}

export async function generateSectionProposal({
  argv = process.argv.slice(2),
  env = process.env,
  Client = BackendClient,
  postgresApi = api,
  adapterRegistry = { get: getSectionProposalAdapter },
  callOpenRouter = null,
  now = () => new Date().toISOString(),
  outputRoot = DEFAULT_OUTPUT_ROOT,
  repoRoot = PROJECT_ROOT,
  loadsEnvLocal = true,
} = {}) {
  const options = parseProposalArgs(argv);
  const adapter = adapterRegistry.get(options.section);
  const context = createBatchProposalReadContext({
    operation: `batch ${options.section} proposal`,
    argv,
    env,
    startDir: repoRoot,
    loadsEnvLocal,
  });
  const sourceUrl = requireBatchSourceUrl(context);
  const targetUrl = requireBatchProposalTargetUrl(context);
  const sourceDeploymentFingerprint = deploymentFingerprint(sourceUrl);
  const targetDeploymentFingerprint = deploymentFingerprint(targetUrl);
  const apiKey = context.env.OPENROUTER_API_KEY;
  if (!callOpenRouter && (!apiKey || !apiKey.trim())) {
    throw new Error("OPENROUTER_API_KEY is required to generate a proposal.");
  }

  const readApi = createProposalReadApi(postgresApi);
  const sourceClient = createQueryOnlyPostgresClient(Client, sourceUrl);
  const targetClient = sourceUrl === targetUrl
    ? sourceClient
    : createQueryOnlyPostgresClient(Client, targetUrl);
  const [sourceArticle, targetArticle] = await Promise.all([
    sourceClient.query(readApi.substanceIndex.getBySlug, { slug: options.slug }),
    targetClient.query(readApi.substanceIndex.getBySlug, { slug: options.slug }),
  ]);
  if (!sourceArticle) throw new Error(`Source article not found: ${options.slug}.`);
  if (!targetArticle) throw new Error(`Target article not found: ${options.slug}.`);
  if (sourceArticle.slug !== options.slug) {
    throw new Error(`Source article identity mismatch: expected ${options.slug}, received ${sourceArticle.slug ?? "missing"}.`);
  }
  if (targetArticle.slug !== options.slug) {
    throw new Error(`Target article identity mismatch: expected ${options.slug}, received ${targetArticle.slug ?? "missing"}.`);
  }

  const inputs = await adapter.loadInputs({
    sourceClient,
    api: readApi,
    slug: options.slug,
    sourceArticle,
    config: adapter.config,
  });
  const capturedAt = now();
  const targetArticleContent = stripDataMetadata(targetArticle);
  const manifestWithoutDigest = {
    schemaVersion: "section-proposal-manifest-v2",
    adapterVersion: adapter.adapterVersion,
    slug: options.slug,
    section: options.section,
    capturedAt,
    deployments: {
      source: {
        identity: sourceDeploymentFingerprint,
        urlProvenanceKey: context.sourceUrlKey,
        fingerprint: sourceDeploymentFingerprint,
      },
      target: {
        identity: targetDeploymentFingerprint,
        urlProvenanceKey: context.targetUrlKey,
        fingerprint: targetDeploymentFingerprint,
      },
    },
    sourceArticle,
    sourceArticleContext: inputs.sourceArticleContext,
    targetArticle,
    targetArticleHash: canonicalHash(targetArticle),
    targetArticleContentHash: canonicalHash(targetArticleContent),
    targetTopLevelFieldHashes: topLevelFieldHashes(targetArticle),
    prompt: {
      key: inputs.promptKey,
      record: inputs.promptRecord,
      exactContent: inputs.promptRecord.content,
      contentHash: sha256Text(inputs.promptRecord.content),
    },
    sourceMaterial: inputs.sourceMaterial,
    messages: {
      system: inputs.systemMessage,
      user: inputs.userMessage,
      systemHash: sha256Text(inputs.systemMessage),
      userHash: sha256Text(inputs.userMessage),
    },
    generation: {
      model: adapter.config.model,
      temperature: adapter.config.temperature,
      maxTokens: adapter.config.maxTokens,
      reasoningEffort: adapter.config.reasoningEffort,
    },
  };
  const manifest = attachManifestDigest(manifestWithoutDigest);
  const outputDir = proposalOutputDirectory({
    rootDir: outputRoot,
    slug: options.slug,
    section: options.section,
    capturedAt,
    manifestDigest: manifest.manifestDigest,
  });
  const manifestPath = resolve(outputDir, "target-manifest.json");
  writeImmutableManifest(manifestPath, manifest);
  if (!existsSync(manifestPath)) {
    throw new Error("Manifest verification failed before generation.");
  }

  const invokeOpenRouter = callOpenRouter ?? adapter.createOpenRouterCaller({
    apiKey,
    config: adapter.config,
    writeDebugArtifact: () => {},
  });
  const response = await invokeOpenRouter(
    inputs.systemMessage,
    inputs.userMessage,
    { slug: options.slug, title: sourceArticle.title },
    { reasoningEffort: adapter.config.reasoningEffort },
  );
  const rawResponse = response.content;
  if (typeof rawResponse !== "string") {
    throw new Error("OpenRouter returned a non-string response.");
  }
  writeRawResponseArtifact(outputDir, rawResponse);

  const generatedValue = adapter.parseGeneratedValue(
    rawResponse,
    { slug: options.slug, title: sourceArticle.title },
    () => {},
  );
  const proposal = buildSectionProposal({
    slug: options.slug,
    targetDeploymentFingerprint,
    targetArticle: targetArticleContent,
    sectionKey: options.section,
    generatedValue,
    manifestDigest: manifest.manifestDigest,
    manifestPath: relative(repoRoot, manifestPath),
    rawResponse,
    usage: response.usage ?? null,
    candidateBuilder: adapter.buildCandidate,
    publicationProfile: adapter.publicationProfile,
    publicationFields: adapter.publicationFields,
  });
  const artifacts = writeProposalArtifacts({
    outputDir,
    manifestPath,
    proposal,
    rawResponse,
    repoRoot,
  });

  return {
    ...artifacts,
    manifestPath,
    outputDir,
    manifestDigest: manifest.manifestDigest,
  };
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(proposalHelpText());
    return;
  }
  const result = await generateSectionProposal();
  console.log(`Proposal status: ${result.proposal.status}`);
  console.log(`Manifest digest: ${result.manifestDigest}`);
  console.log(`Artifacts: ${relative(PROJECT_ROOT, result.outputDir)}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
