#!/usr/bin/env node
/**
 * Apply reviewed Fable subjective-effects drafts to currently empty Postgres articles.
 *
 * Usage:
 *   node scripts/data-ops/apply-fable-subjective-effects.mjs --dry-run --limit=5
 *   node scripts/data-ops/apply-fable-subjective-effects.mjs --write \
 *     --confirm-write=apply-fable-subjective-effects \
 *     --expected-deployment=<host/database>
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import yaml from "../../node_modules/yaml/dist/index.js";

import { api } from "../../lib/postgres/runtime/api.ts";
import { subjectiveEffectsSchema } from "../../src/schema/substance/subjective-effects.ts";
import { stripDataMetadata } from "../batch/summary/articles.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const RUN_DIRECTORY = resolve(
  REPO_ROOT,
  getFlagValue(process.argv.slice(2), "--run-dir") ?? "runs/subjective-effects-fable-2026-07-24",
);
const DRAFT_DIRECTORY = resolve(RUN_DIRECTORY, "drafts");
const DRAFT_SUFFIX = "-se-draft.yaml";
const ATTRIBUTION = {
  author: "dose.wiki AI editorial pipeline",
  text: "This section was synthesized from the article's collected source material by dose.wiki's AI editorial pipeline.",
  url: "",
};

function parseLimit(value) {
  if (value === null) return null;
  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`--limit must be a positive integer; received ${value}`);
  }
  return limit;
}

function parseOptions(argv) {
  const write = argv.includes("--write");
  const dryRun = argv.includes("--dry-run") || !write;
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }

  const overwriteExisting = argv.includes("--overwrite-existing");
  if (overwriteExisting && !getFlagValue(argv, "--slug")) {
    throw new Error("--overwrite-existing requires --slug=<slug>; it never applies to a whole run.");
  }

  return {
    dryRun,
    write,
    slug: getFlagValue(argv, "--slug"),
    limit: parseLimit(getFlagValue(argv, "--limit")),
    overwriteExisting,
  };
}

function loadDrafts(options) {
  const fileNames = readdirSync(DRAFT_DIRECTORY)
    .filter((fileName) => fileName.endsWith(DRAFT_SUFFIX))
    .sort();
  const selected = options.slug
    ? fileNames.filter((fileName) => fileName === `${options.slug}${DRAFT_SUFFIX}`)
    : fileNames;
  const limited = options.limit === null ? selected : selected.slice(0, options.limit);

  return limited.map((fileName) => {
    const filePath = resolve(DRAFT_DIRECTORY, fileName);
    const parsed = yaml.parse(readFileSync(filePath, "utf-8"));
    return {
      fileName,
      filePath,
      slug: fileName.slice(0, -DRAFT_SUFFIX.length),
      subjectiveEffects: parsed?.subjective_effects,
    };
  });
}

function hasCoreSubjectiveEffectsContent(article) {
  const subjectiveEffects = article.subjective_effects;
  if (!subjectiveEffects) return false;

  const hasSensory =
    subjectiveEffects.sensory &&
    Object.values(subjectiveEffects.sensory).some(
      (sense) => sense?.subcategories && Object.keys(sense.subcategories).length > 0,
    );
  const hasCognitive =
    subjectiveEffects.cognitive && Object.keys(subjectiveEffects.cognitive).length > 0;
  const hasPhysical =
    subjectiveEffects.physical && Object.keys(subjectiveEffects.physical).length > 0;
  const hasProgressiveStages =
    subjectiveEffects.progressive_stages &&
    Object.keys(subjectiveEffects.progressive_stages).length > 0;
  const hasOverview = subjectiveEffects.notes?.overview?.trim().length > 0;

  return Boolean(hasSensory || hasCognitive || hasPhysical || hasProgressiveStages || hasOverview);
}

function normalizeEffectName(name) {
  const words = name.split(/(\s+)/);
  let wordIndex = 0;

  return words
    .map((part) => {
      if (/^\s+$/.test(part)) return part;

      const isFirstWord = wordIndex++ === 0;
      // Only title-cased, alphabetic words such as "Heart" are normalized.
      // This preserves acronyms, internal capitalization (NBOMe), digits, and
      // one-letter uppercase terms.
      const shouldLowercase = !isFirstWord && /^[A-Z][a-z]+$/.test(part);
      return shouldLowercase ? part.toLowerCase() : part;
    })
    .join("");
}

function normalizeEffectNames(value, path = "subjective_effects", changes = []) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeEffectNames(entry, `${path}[${index}]`, changes));
  }
  if (!value || typeof value !== "object") return value;

  const normalized = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "effects" && Array.isArray(nestedValue)) {
      normalized[key] = nestedValue.map((effect, index) => {
        if (!effect || typeof effect !== "object" || typeof effect.name !== "string") {
          return effect;
        }
        const name = normalizeEffectName(effect.name);
        if (name !== effect.name) {
          changes.push({ path: `${path}.effects[${index}].name`, before: effect.name, after: name });
        }
        return { ...effect, name };
      });
      continue;
    }
    normalized[key] = normalizeEffectNames(nestedValue, `${path}.${key}`, changes);
  }
  return normalized;
}

async function withRetry(operation, label, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < attempts) {
        console.log(`  retry ${attempt}/${attempts - 1} after error on ${label}: ${message}`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastError;
}

function deploymentName(targetUrl) {
  return new URL(targetUrl).hostname.replace(/[^a-z0-9.-]/gi, "_");
}

function printNormalizations(changes) {
  for (const change of changes) {
    console.log(`  normalize ${change.path}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseOptions(argv);
  const runContext = createDataOpsRunContext({
    operation: "apply fable subjective effects",
    intent: "editorArticleWrite",
    argv,
    sourceUrlKeys: [],
    selectedTables: ["substanceIndex"],
    localArtifacts: [DRAFT_DIRECTORY],
    destructive: true,
  });

  // Data-ops contexts only mark an explicit --dry-run as dry. This command is
  // deliberately dry by default, so reflect that in its printed context as well.
  if (options.dryRun) {
    runContext.dryRun = true;
    runContext.writeEnabled = false;
  }

  const drafts = loadDrafts(options);
  printDataOpsRunContext(runContext);
  console.log(`Drafts selected: ${drafts.length}`);
  if (options.slug && drafts.length === 0) {
    console.log(`No draft file found for slug: ${options.slug}`);
  }

  const targetUrl = requireTargetUrl(runContext, "Postgres subjective effects target URL");
  if (options.write) {
    assertDataOpsWriteAllowed(runContext);
  }
  const client = createDataClient({ target: targetUrl }).client;
  const apiKey = options.write ? requireAdminIntentToken("editorArticleWrite").token : null;
  const outcomes = [];
  const counts = {
    applied: 0,
    "skipped-existing": 0,
    "skipped-missing": 0,
    "skipped-invalid": 0,
    failed: 0,
  };

  for (const draft of drafts) {
    const article = await withRetry(
      () => client.query(api.substanceIndex.getBySlug, { slug: draft.slug }),
      `getBySlug(${draft.slug})`,
    );
    if (!article) {
      counts["skipped-missing"] += 1;
      outcomes.push({ slug: draft.slug, outcome: "skipped-missing", reason: "article not found" });
      console.log(`${draft.slug}: skipped (article not found)`);
      continue;
    }
    if (hasCoreSubjectiveEffectsContent(article) && !options.overwriteExisting) {
      counts["skipped-existing"] += 1;
      outcomes.push({ slug: draft.slug, outcome: "skipped-existing", reason: "core subjective_effects content already exists" });
      console.log(`${draft.slug}: skipped (core subjective_effects content already exists)`);
      continue;
    }

    const changes = [];
    const normalizedSubjectiveEffects = normalizeEffectNames(
      draft.subjectiveEffects,
      "subjective_effects",
      changes,
    );
    const subjectiveEffects =
      normalizedSubjectiveEffects &&
      typeof normalizedSubjectiveEffects === "object" &&
      !Array.isArray(normalizedSubjectiveEffects)
        ? { ...normalizedSubjectiveEffects, attribution: ATTRIBUTION }
        : normalizedSubjectiveEffects;
    const validation = subjectiveEffectsSchema.safeParse(subjectiveEffects);
    if (!validation.success) {
      counts["skipped-invalid"] += 1;
      outcomes.push({
        slug: draft.slug,
        outcome: "skipped-invalid",
        reason: "subjective_effects failed schema validation",
        issues: validation.error.issues,
      });
      console.log(`${draft.slug}: skipped (subjective_effects failed schema validation)`);
      console.log(JSON.stringify(validation.error.issues, null, 2));
      printNormalizations(changes);
      continue;
    }

    const mode = options.write ? "applied" : "would apply";
    console.log(`${draft.slug}: ${mode} (${changes.length} effect-name normalizations)`);
    printNormalizations(changes);

    if (!options.write) {
      counts.applied += 1;
      outcomes.push({ slug: draft.slug, outcome: "applied", dryRun: true, normalizations: changes });
      continue;
    }

    const updatedArticle = {
      ...article,
      subjective_effects: validation.data,
    };
    try {
      const result = await withRetry(
        () => client.mutation(api.substanceIndex.saveSubstance, {
          apiKey,
          article: stripDataMetadata(updatedArticle),
        }),
        `saveSubstance(${draft.slug})`,
      );
      counts.applied += 1;
      outcomes.push({ slug: draft.slug, outcome: "applied", normalizations: changes, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      counts.failed += 1;
      outcomes.push({ slug: draft.slug, outcome: "failed", reason: message, normalizations: changes });
      console.error(`${draft.slug}: failed to save (${message})`);
    }
  }

  console.log(
    `Summary: applied=${counts.applied} skipped-existing=${counts["skipped-existing"]} ` +
      `skipped-missing=${counts["skipped-missing"]} skipped-invalid=${counts["skipped-invalid"]}` +
      (counts.failed ? ` failed=${counts.failed}` : ""),
  );

  if (options.write) {
    const auditPath = resolve(RUN_DIRECTORY, `apply-audit-${deploymentName(targetUrl)}.json`);
    mkdirSync(RUN_DIRECTORY, { recursive: true });
    writeFileSync(
      auditPath,
      JSON.stringify({
        operation: "apply-fable-subjective-effects",
        targetDeployment: deploymentName(targetUrl),
        createdAt: new Date().toISOString(),
        summary: counts,
        outcomes,
      }, null, 2) + "\n",
    );
    console.log(`Audit: ${auditPath}`);
  }

  if (counts.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
