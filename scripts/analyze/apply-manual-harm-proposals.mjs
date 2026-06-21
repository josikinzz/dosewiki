#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
import { normalizeArticleInput } from "../../src/features/dev/tools/substance-editor/yamlParser.ts";
import { sanitizeObjectKeys, stripConvexMetadata } from "../batch/summary/articles.mjs";
import {
  assertNoPublicProseArtifactLanguage,
  assertNoPublicProseNamedSourceAttribution,
} from "./public-prose-artifact-language-core.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = parseArgs(process.argv.slice(2));
const adminKey = process.env.CONVEX_ADMIN_KEY;

if (!adminKey && args.write) {
  throw new Error("CONVEX_ADMIN_KEY is required with --write");
}

const proposalPaths = (args.proposals || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => path.resolve(repoRoot, entry));

if (proposalPaths.length === 0) {
  throw new Error("Provide --proposals=<path[,path...]>");
}

const deployments = [
  ["public", "https://glad-minnow-656.convex.cloud"],
  ["editor", "https://enchanted-echidna-791.convex.cloud"],
];

const proposals = proposalPaths.flatMap((proposalPath) => {
  if (!existsSync(proposalPath)) {
    throw new Error(`Proposal file not found: ${proposalPath}`);
  }
  const doc = JSON.parse(readFileSync(proposalPath, "utf8"));
  if (!Array.isArray(doc.proposals)) {
    throw new Error(`${proposalPath}: proposals must be an array`);
  }
  return doc.proposals.map((proposal) => ({ ...proposal, proposalPath }));
});

const validationErrors = [];
const nonEmptyProposals = [];
for (const proposal of proposals) {
  const errors = validateProposal(proposal);
  if (errors.length > 0) {
    validationErrors.push(...errors.map((error) => `${proposal.slug ?? "unknown"}: ${error}`));
  } else if (hasHarmContent(proposal.harm_potential)) {
    nonEmptyProposals.push(proposal);
  }
}

if (validationErrors.length > 0) {
  console.error(validationErrors.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  proposalCount: proposals.length,
  nonEmptyCount: nonEmptyProposals.length,
  emptyCount: proposals.length - nonEmptyProposals.length,
  write: Boolean(args.write),
}, null, 2));

if (!args.write) {
  process.exit(0);
}

for (const [label, url] of deployments) {
  const client = new ConvexHttpClient(url);
  const updates = [];
  for (const proposal of nonEmptyProposals) {
    const article = await client.query(api.substanceIndex.getBySlug, { slug: proposal.slug });
    if (!article) {
      throw new Error(`${label}: missing article ${proposal.slug}`);
    }
    const nextArticle = normalizeArticleInput(stripConvexMetadata(article));
    nextArticle.harm_potential = proposal.harm_potential;
    assertNoPublicProseArtifactLanguage(nextArticle, {
      sections: ["harm_potential"],
      sourcePath: `${proposal.proposalPath}:harm_potential:${proposal.slug}`,
    });
    assertNoPublicProseNamedSourceAttribution(nextArticle, {
      sections: ["harm_potential"],
      sourcePath: `${proposal.proposalPath}:harm_potential:${proposal.slug}`,
    });
    updates.push(sanitizeObjectKeys(nextArticle));
  }
  const result = updates.length
    ? await client.mutation(api.substanceIndex.saveSubstances, {
        apiKey: adminKey,
        articles: updates,
      })
    : { updated: 0, created: 0, skipped: 0, errors: [] };
  console.log(label, {
    updated: result.updated ?? 0,
    created: result.created ?? 0,
    skipped: result.skipped ?? 0,
    errors: result.errors?.length ?? 0,
  });
  if (result.errors?.length) {
    console.error(result.errors.join("\n"));
    process.exit(1);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--write") {
      parsed.write = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) parsed[match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = match[2];
  }
  return parsed;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasHarmContent(harm) {
  return hasText(harm?.addiction?.psychological?.description) ||
    hasText(harm?.addiction?.physical_dependence?.description) ||
    hasText(harm?.toxicity?.lethal_dosage?.notes) ||
    (Array.isArray(harm?.toxicity?.lethal_dosage?.ld50) && harm.toxicity.lethal_dosage.ld50.length > 0) ||
    (Array.isArray(harm?.toxicity?.organ_toxicity) && harm.toxicity.organ_toxicity.length > 0) ||
    hasText(harm?.toxicity?.carcinogenicity?.description) ||
    hasText(harm?.toxicity?.antibiotic_function?.description) ||
    hasText(harm?.psychosis?.description) ||
    hasText(harm?.seizure?.description);
}

function validateProposal(proposal) {
  const errors = [];
  if (!proposal.slug || typeof proposal.slug !== "string") errors.push("missing slug");
  if (!proposal.title || typeof proposal.title !== "string") errors.push("missing title");
  const harm = proposal.harm_potential;
  if (!harm || typeof harm !== "object" || Array.isArray(harm)) {
    errors.push("harm_potential must be an object");
    return errors;
  }

  for (const pathKey of [
    "addiction.psychological.description",
    "addiction.physical_dependence.description",
    "toxicity.lethal_dosage.notes",
    "toxicity.carcinogenicity.description",
    "toxicity.antibiotic_function.description",
    "psychosis.description",
    "seizure.description",
  ]) {
    if (typeof getPath(harm, pathKey) !== "string") errors.push(`${pathKey} must be a string`);
  }

  if (!Array.isArray(harm.toxicity?.lethal_dosage?.ld50)) errors.push("toxicity.lethal_dosage.ld50 must be an array");
  if (!Array.isArray(harm.toxicity?.organ_toxicity)) errors.push("toxicity.organ_toxicity must be an array");
  if (
    harm.toxicity?.carcinogenicity?.evidence !== null &&
    typeof harm.toxicity?.carcinogenicity?.evidence !== "object"
  ) {
    errors.push("toxicity.carcinogenicity.evidence must be null or a structured evidence object");
  }

  for (const [index, entry] of (harm.toxicity?.lethal_dosage?.ld50 ?? []).entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`toxicity.lethal_dosage.ld50[${index}] must be an object`);
      continue;
    }
    for (const key of ["species", "route", "unit"]) {
      if (typeof entry[key] !== "string") {
        errors.push(`toxicity.lethal_dosage.ld50[${index}].${key} must be a string`);
      }
    }
    if (entry.value !== null && typeof entry.value !== "number") {
      errors.push(`toxicity.lethal_dosage.ld50[${index}].value must be a number or null`);
    }
  }

  for (const [index, entry] of (harm.toxicity?.organ_toxicity ?? []).entries()) {
    for (const key of ["system", "findings", "mechanism", "notes"]) {
      if (typeof entry?.[key] !== "string") {
        errors.push(`toxicity.organ_toxicity[${index}].${key} must be a string`);
      }
    }
    if ("organ_system" in (entry ?? {})) {
      errors.push(`toxicity.organ_toxicity[${index}] must use system, not organ_system`);
    }
  }

  return errors;
}

function getPath(value, pathKey) {
  return pathKey.split(".").reduce((current, part) => current?.[part], value);
}
