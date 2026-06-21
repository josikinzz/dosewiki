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
  } else if (hasLegalityContent(proposal.legality)) {
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
    nextArticle.legality = proposal.legality;
    assertNoPublicProseArtifactLanguage(nextArticle, {
      sections: ["legality"],
      sourcePath: `${proposal.proposalPath}:legality:${proposal.slug}`,
    });
    assertNoPublicProseNamedSourceAttribution(nextArticle, {
      sections: ["legality"],
      sourcePath: `${proposal.proposalPath}:legality:${proposal.slug}`,
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

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasLegalityContent(legality) {
  return (Array.isArray(legality?.international) && legality.international.some(hasText)) ||
    Object.values(legality?.countries ?? {}).some((entry) => hasText(entry?.status) || hasText(entry?.notes));
}

function validateProposal(proposal) {
  const errors = [];
  if (!proposal.slug || typeof proposal.slug !== "string") errors.push("missing slug");
  if (!proposal.title || typeof proposal.title !== "string") errors.push("missing title");
  const legality = proposal.legality;
  if (!isRecord(legality)) {
    errors.push("legality must be an object");
    return errors;
  }

  if (!Array.isArray(legality.international)) {
    errors.push("legality.international must be an array");
  } else {
    for (const [index, entry] of legality.international.entries()) {
      if (typeof entry !== "string") {
        errors.push(`legality.international[${index}] must be a string`);
      }
    }
  }

  if (!isRecord(legality.countries)) {
    errors.push("legality.countries must be an object");
  } else {
    for (const [country, entry] of Object.entries(legality.countries)) {
      if (!isRecord(entry)) {
        errors.push(`legality.countries[${JSON.stringify(country)}] must be an object`);
        continue;
      }
      if (typeof entry.status !== "string") {
        errors.push(`legality.countries[${JSON.stringify(country)}].status must be a string`);
      }
      if (typeof entry.notes !== "string") {
        errors.push(`legality.countries[${JSON.stringify(country)}].notes must be a string`);
      }
    }
  }

  return errors;
}
