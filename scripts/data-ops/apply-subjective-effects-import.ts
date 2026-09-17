#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createDataClient, type DataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { normalizePharmacologySection } from "../../lib/article/normalization.mjs";
import {
  subjectiveEffectsSchema,
  type SubjectiveEffects,
} from "../../src/schema/substance/subjective-effects";
import {
  formatSubstanceArticleContractIssues,
  validateSubstanceArticleContract,
} from "../../src/schema/substance/contract";
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
createDataOpsRunContext,
getFlagValue,
printDataOpsRunContext,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

const DEFAULT_JSON_DIR = "content/sources/psychonautwiki-2015/json";
const DEFAULT_TRACKER_PATH =
  "content/sources/psychonautwiki-2015/subjective-effects-integration-tracker.md";
const ARCHIVE_CUTOFF = Date.parse("2016-08-31T23:59:59.999Z");
const BATCH_SIZE = 10;

type Draft = {
  slug: string;
  title: string;
  source_markdown: string;
  archive_timestamp: string;
  archive_date_utc: string;
  archive_url: string;
  attribution: {
    author: string;
    text: string;
    url: string;
  };
  subjective_effects: SubjectiveEffects;
  fidelity_notes?: string[];
};

type TrackerRow = {
  number: number;
  slug: string;
  convertStatus: string;
  jsonStatus: string;
  fidelityStatus: string;
  dbApplyStatus: string;
};

type PlannedArticle = {
  slug: string;
  title: string;
  article: Record<string, unknown>;
  archiveUrl: string;
  changed: boolean;
  subjectiveEffectsChanged: boolean;
  affectedPaths: string[];
  legacyRepairPaths: string[];
};

const VALID_REFERENCE_TEMPLATES = new Set([
  "cite_journal",
  "cite_book",
  "cite_web",
  "cite_report",
  "cite_database",
  "unknown",
]);

const IDENTIFICATION_STRING_KEYS = [
  "common_name",
  "substitutive_name",
  "iupac_name",
  "smiles",
  "inchi_key",
  "cas_number",
  "molecular_formula",
  "molecular_weight",
  "skeletal_structure_image",
  "botanical_name",
];

function hasArg(argv: string[], flag: string) {
  return argv.includes(flag);
}

function parseOptions(argv: string[]) {
  const validateOnly = hasArg(argv, "--validate-only");
  const verifyOnly = hasArg(argv, "--verify-only");
  const write = hasArg(argv, "--write");
  const slug = getFlagValue(argv, "--slug");

  return {
    validateOnly,
    verifyOnly,
    write,
    dryRun: hasArg(argv, "--dry-run") || (!write && !validateOnly && !verifyOnly),
    jsonDir: getFlagValue(argv, "--json-dir") ?? DEFAULT_JSON_DIR,
    trackerPath: getFlagValue(argv, "--tracker") ?? DEFAULT_TRACKER_PATH,
    slug,
    expectDbStatus: getFlagValue(argv, "--expect-db-status") ?? (verifyOnly ? "any" : "todo"),
    help: hasArg(argv, "--help") || hasArg(argv, "-h"),
  };
}

function printHelp() {
  console.log(`
Apply archived Subjective Effect Documentation subjective_effects JSON drafts through Postgres saveSubstances.

Usage:
  bun scripts/data-ops/apply-subjective-effects-import.ts --validate-only
  bun scripts/data-ops/apply-subjective-effects-import.ts --dry-run
  bun scripts/data-ops/apply-subjective-effects-import.ts --write --confirm-subjective-effects-write
  bun scripts/data-ops/apply-subjective-effects-import.ts --verify-only

Options:
  --slug=<slug>                         Limit to one draft
  --json-dir=<path>                     JSON draft directory
  --tracker=<path>                      Tracker markdown path
  --expect-db-status=<status|any>       Tracker db_apply_status expectation
  --dry-run                             Plan without writing
  --write                               Persist through api.substanceIndex.saveSubstances
  --confirm-subjective-effects-write    Required with --write
  --verify-only                         Query Postgres and verify imported attribution URLs
  --validate-only                       Validate local JSON drafts and tracker only
`);
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, nestedValue) => {
    if (
      nestedValue &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue)
    ) {
      return Object.keys(nestedValue)
        .sort()
        .reduce<Record<string, unknown>>((sorted, key) => {
          sorted[key] = (nestedValue as Record<string, unknown>)[key];
          return sorted;
        }, {});
    }
    return nestedValue;
  });
}

function stripDataInternalFields(article: Record<string, unknown>) {
  const { _id: _dataId, _creationTime: _creationTime, ...rest } = article;
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function getStringRecord(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function setIfChanged(
  record: Record<string, unknown>,
  path: string,
  key: string,
  value: unknown,
  repairPaths: string[],
) {
  if (stableStringify(record[key]) !== stableStringify(value)) {
    record[key] = value;
    repairPaths.push(path);
  }
}

function normalizeLegacyIdentification(value: unknown, repairPaths: string[]) {
  const raw = isRecord(value) ? value : {};
  const next = { ...raw };

  for (const key of IDENTIFICATION_STRING_KEYS) {
    setIfChanged(next, `identification.${key}`, key, getString(raw[key]), repairPaths);
  }
  setIfChanged(
    next,
    "identification.alternative_names",
    "alternative_names",
    getStringArray(raw.alternative_names),
    repairPaths,
  );

  return next;
}

function normalizeLegacyPharmacology(value: unknown, repairPaths: string[]) {
  const normalized = normalizePharmacologySection(value);
  if (JSON.stringify(value) !== JSON.stringify(normalized)) {
    repairPaths.push("pharmacology.binding_sites");
  }
  return normalized;
}

function normalizeLegacyReagentTesting(value: unknown, repairPaths: string[]) {
  const normalized = getStringRecord(value) ?? {};
  if (stableStringify(value) !== stableStringify(normalized)) {
    repairPaths.push("reagent_testing");
  }
  return normalized;
}

function normalizeLegacyTolerance(value: unknown, repairPaths: string[]) {
  const raw = isRecord(value) ? value : {};
  const next = { ...raw };

  setIfChanged(next, "tolerance.full_tolerance", "full_tolerance", getString(raw.full_tolerance), repairPaths);
  setIfChanged(next, "tolerance.half_tolerance", "half_tolerance", getString(raw.half_tolerance), repairPaths);
  setIfChanged(next, "tolerance.baseline_tolerance", "baseline_tolerance", getString(raw.baseline_tolerance), repairPaths);
  setIfChanged(next, "tolerance.cross_tolerance", "cross_tolerance", getStringArray(raw.cross_tolerance), repairPaths);

  return next;
}

function normalizeLegacyReferences(value: unknown, repairPaths: string[]) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((reference, index) => {
    if (!isRecord(reference)) {
      repairPaths.push(`references.${index}`);
      return reference;
    }

    const template = reference.template;
    if (
      template === undefined ||
      template === null ||
      (typeof template === "string" && VALID_REFERENCE_TEMPLATES.has(template))
    ) {
      return reference;
    }

    repairPaths.push(`references.${index}.template`);
    return {
      ...reference,
      template: "unknown",
    };
  });
}

function materializeArticleForContract(article: Record<string, unknown>) {
  const next = JSON.parse(JSON.stringify(article)) as Record<string, unknown>;
  const legacyRepairPaths: string[] = [];

  setIfChanged(
    next,
    "identification",
    "identification",
    normalizeLegacyIdentification(next.identification, legacyRepairPaths),
    legacyRepairPaths,
  );
  setIfChanged(next, "summary", "summary", getString(next.summary), legacyRepairPaths);
  setIfChanged(
    next,
    "pharmacology",
    "pharmacology",
    normalizeLegacyPharmacology(next.pharmacology, legacyRepairPaths),
    legacyRepairPaths,
  );
  setIfChanged(
    next,
    "reagent_testing",
    "reagent_testing",
    normalizeLegacyReagentTesting(next.reagent_testing, legacyRepairPaths),
    legacyRepairPaths,
  );
  setIfChanged(
    next,
    "tolerance",
    "tolerance",
    normalizeLegacyTolerance(next.tolerance, legacyRepairPaths),
    legacyRepairPaths,
  );
  setIfChanged(
    next,
    "references",
    "references",
    normalizeLegacyReferences(next.references, legacyRepairPaths),
    legacyRepairPaths,
  );

  return {
    article: next,
    legacyRepairPaths: Array.from(new Set(legacyRepairPaths)).sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function getDraftPaths(jsonDir: string, slug: string | null) {
  const absoluteJsonDir = resolve(jsonDir);
  if (!existsSync(absoluteJsonDir)) {
    throw new Error(`JSON draft directory not found: ${jsonDir}`);
  }

  const paths = readdirSync(absoluteJsonDir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => resolve(absoluteJsonDir, entry))
    .sort((left, right) => left.localeCompare(right));

  if (slug) {
    return paths.filter((path) => basename(path, ".json") === slug);
  }

  return paths;
}

function parseTrackerRows(trackerPath: string): TrackerRow[] {
  const content = readFileSync(resolve(trackerPath), "utf-8");

  return content
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return {
        number: Number(cells[0]),
        slug: cells[1].replace(/`/g, ""),
        convertStatus: cells[6],
        jsonStatus: cells[7],
        fidelityStatus: cells[8],
        dbApplyStatus: cells[9],
      };
    });
}

function countEffectsInCategory(category: Record<string, { effects?: unknown[] }> | null | undefined) {
  if (!category) {
    return 0;
  }
  return Object.values(category).reduce((total, subcategory) => {
    return total + (Array.isArray(subcategory.effects) ? subcategory.effects.length : 0);
  }, 0);
}

function countSubjectiveEffects(subjectiveEffects: SubjectiveEffects | null | undefined) {
  if (!subjectiveEffects) {
    return 0;
  }

  const sensoryCount = Object.values(subjectiveEffects.sensory).reduce((total, sense) => {
    return total + countEffectsInCategory(sense.subcategories);
  }, 0);

  return (
    sensoryCount +
    countEffectsInCategory(subjectiveEffects.cognitive) +
    countEffectsInCategory(subjectiveEffects.physical) +
    countEffectsInCategory(subjectiveEffects.progressive_stages ?? null)
  );
}

function hasMeaningfulSubjectiveEffects(subjectiveEffects: SubjectiveEffects | null | undefined) {
  if (!subjectiveEffects) {
    return false;
  }

  const hasNote = Object.values(subjectiveEffects.notes).some((value) => value.trim().length > 0);
  return hasNote || countSubjectiveEffects(subjectiveEffects) > 0;
}

function validateDraft(draft: Draft, path: string) {
  const issues: string[] = [];
  const filenameSlug = basename(path, ".json");

  if (draft.slug !== filenameSlug) {
    issues.push(`slug "${draft.slug}" does not match file name "${filenameSlug}"`);
  }

  if (!draft.archive_url.startsWith("https://web.archive.org/web/")) {
    issues.push("archive_url is not an Internet Archive URL");
  }

  if (draft.archive_url.includes("psychonautwiki.org/wiki/") === false) {
    issues.push("archive_url is not an expected archived source article URL");
  }

  const archiveTime = Date.parse(draft.archive_date_utc);
  if (!Number.isFinite(archiveTime)) {
    issues.push("archive_date_utc is invalid");
  } else if (archiveTime > ARCHIVE_CUTOFF) {
    issues.push(`archive_date_utc is after 2016-08-31: ${draft.archive_date_utc}`);
  }

  if (draft.attribution?.author !== "Josie Kins") {
    issues.push("top-level attribution.author is not Josie Kins");
  }

  if (draft.attribution?.url !== draft.archive_url) {
    issues.push("top-level attribution.url does not exactly match archive_url");
  }
  if (/psychonautwiki/i.test(draft.attribution?.text ?? "")) {
    issues.push("top-level attribution.text contains the source site name");
  }

  const subjectiveEffectsValidation = subjectiveEffectsSchema.safeParse(draft.subjective_effects);
  if (!subjectiveEffectsValidation.success) {
    issues.push(
      ...subjectiveEffectsValidation.error.issues.map((issue) => {
        const issuePath = issue.path.length ? issue.path.join(".") : "<root>";
        return `subjective_effects.${issuePath}: ${issue.message}`;
      }),
    );
  } else {
    const attribution = subjectiveEffectsValidation.data.attribution;
    if (attribution?.author !== "Josie Kins") {
      issues.push("subjective_effects.attribution.author is not Josie Kins");
    }
    if (attribution?.url !== draft.archive_url) {
      issues.push("subjective_effects.attribution.url does not exactly match archive_url");
    }
    if (/psychonautwiki/i.test(attribution?.text ?? "")) {
      issues.push("subjective_effects.attribution.text contains the source site name");
    }
    if (!hasMeaningfulSubjectiveEffects(subjectiveEffectsValidation.data)) {
      issues.push("subjective_effects has no notes or effects");
    }
  }

  return issues;
}

function loadAndValidateDrafts({
  jsonDir,
  trackerPath,
  slug,
  expectDbStatus,
}: {
  jsonDir: string;
  trackerPath: string;
  slug: string | null;
  expectDbStatus: string;
}) {
  const draftPaths = getDraftPaths(jsonDir, slug);
  const drafts = draftPaths.map((path) => ({ path, draft: readJson(path) as Draft }));
  const trackerRows = parseTrackerRows(trackerPath);
  const trackerRowsBySlug = new Map(trackerRows.map((row) => [row.slug, row]));
  const issues: string[] = [];

  if (!slug && drafts.length !== 34) {
    issues.push(`expected 34 JSON drafts, found ${drafts.length}`);
  }

  if (!slug && trackerRows.length !== 34) {
    issues.push(`expected 34 tracker rows, found ${trackerRows.length}`);
  }

  for (const { path, draft } of drafts) {
    const draftIssues = validateDraft(draft, path);
    issues.push(...draftIssues.map((issue) => `${draft.slug}: ${issue}`));

    const row = trackerRowsBySlug.get(draft.slug);
    if (!row) {
      issues.push(`${draft.slug}: missing tracker row`);
      continue;
    }

    if (row.convertStatus !== "converted") {
      issues.push(`${draft.slug}: convert_status=${row.convertStatus}`);
    }
    if (row.jsonStatus !== "json_ready") {
      issues.push(`${draft.slug}: json_status=${row.jsonStatus}`);
    }
    if (row.fidelityStatus !== "fidelity_passed") {
      issues.push(`${draft.slug}: fidelity_status=${row.fidelityStatus}`);
    }
    if (expectDbStatus !== "any" && row.dbApplyStatus !== expectDbStatus) {
      issues.push(`${draft.slug}: db_apply_status=${row.dbApplyStatus}, expected ${expectDbStatus}`);
    }
  }

  const draftSlugs = new Set(drafts.map(({ draft }) => draft.slug));
  for (const row of trackerRows) {
    if (slug && row.slug !== slug) {
      continue;
    }
    if (!draftSlugs.has(row.slug)) {
      issues.push(`${row.slug}: tracker row has no JSON draft`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Draft validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  }

  console.log(
    `Draft validation: ok (${drafts.length} JSON, ${slug ? 1 : trackerRows.length} tracker rows, db_apply_status expected ${expectDbStatus})`,
  );

  return drafts.map(({ draft }) => draft);
}

function planImport({
  articles,
  drafts,
}: {
  articles: Array<Record<string, unknown>>;
  drafts: Draft[];
}) {
  const articlesBySlug = new Map(
    articles
      .filter((article) => typeof article.slug === "string")
      .map((article) => [article.slug as string, article]),
  );
  const plans: PlannedArticle[] = [];
  const errors: string[] = [];

  for (const draft of drafts) {
    const current = articlesBySlug.get(draft.slug);
    if (!current) {
      errors.push(`${draft.slug}: no Postgres article found for slug`);
      continue;
    }

    const mergedArticle = {
      ...stripDataInternalFields(current),
      subjective_effects: draft.subjective_effects,
    };
    const { article, legacyRepairPaths } = materializeArticleForContract(mergedArticle);

    const validation = validateSubstanceArticleContract(article);
    if (!validation.ok) {
      errors.push(
        `${draft.slug}: merged article contract failed: ${formatSubstanceArticleContractIssues(validation.issues)}`,
      );
      continue;
    }

    const subjectiveEffectsChanged =
      stableStringify(stripDataInternalFields(current).subjective_effects) !==
      stableStringify(draft.subjective_effects);
    const changed = subjectiveEffectsChanged || legacyRepairPaths.length > 0;

    plans.push({
      slug: draft.slug,
      title: draft.title,
      article: validation.article as Record<string, unknown>,
      archiveUrl: draft.archive_url,
      changed,
      subjectiveEffectsChanged,
      affectedPaths: ["/substances", `/${draft.slug}`],
      legacyRepairPaths,
    });
  }

  return { plans, errors };
}

function printPlan(plans: PlannedArticle[], errors: string[]) {
  const changed = plans.filter((plan) => plan.changed);
  const unchanged = plans.filter((plan) => !plan.changed);

  console.log(
    `Plan: ${plans.length} matched, ${changed.length} changed, ${unchanged.length} unchanged, ${errors.length} errors`,
  );

  for (const plan of changed) {
    const changedPaths = [
      plan.subjectiveEffectsChanged ? "subjective_effects" : null,
      ...plan.legacyRepairPaths,
    ].filter(Boolean);
    console.log(`- ${plan.slug}: ${changedPaths.join(", ")} -> ${plan.affectedPaths.join(", ")}`);
    if (plan.legacyRepairPaths.length > 0) {
      console.log(`  legacy contract repairs: ${plan.legacyRepairPaths.join(", ")}`);
    }
  }

  for (const plan of unchanged) {
    console.log(`- ${plan.slug}: skipped unchanged`);
  }

  for (const error of errors) {
    console.log(`- error: ${error}`);
  }
}

async function writePlans({
  client,
  plans,
  token,
}: {
  client: DataClient;
  plans: PlannedArticle[];
  token: string;
}) {
  const changed = plans.filter((plan) => plan.changed);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const outcomes: unknown[] = [];

  for (let index = 0; index < changed.length; index += BATCH_SIZE) {
    const batch = changed.slice(index, index + BATCH_SIZE);
    const result = await client.mutation(api.substanceIndex.saveSubstances, {
      apiKey: token,
      articles: batch.map((plan) => plan.article) as never,
    });

    created += result.created ?? 0;
    updated += result.updated ?? 0;
    skipped += result.skipped ?? 0;
    if (Array.isArray(result.errors)) {
      errors.push(...result.errors);
    }
    if (Array.isArray(result.outcomes)) {
      outcomes.push(...result.outcomes);
    }

    console.log(
      `Write batch ${Math.floor(index / BATCH_SIZE) + 1}/${Math.ceil(changed.length / BATCH_SIZE)}: created=${result.created ?? 0}, updated=${result.updated ?? 0}, skipped=${result.skipped ?? 0}`,
    );
  }

  return { created, updated, skipped, errors, outcomes };
}

async function verifyImport({
  client,
  drafts,
}: {
  client: DataClient;
  drafts: Draft[];
}) {
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage) as Record<string, unknown>[];
  const articlesBySlug = new Map(
    articles
      .filter((article: Record<string, unknown>) => typeof article.slug === "string")
      .map((article: Record<string, unknown>) => [article.slug as string, article]),
  );
  const errors: string[] = [];

  for (const draft of drafts) {
    const article = articlesBySlug.get(draft.slug);
    const subjectiveEffects = article?.subjective_effects as SubjectiveEffects | undefined;
    if (!article) {
      errors.push(`${draft.slug}: missing article after write`);
      continue;
    }
    if (!hasMeaningfulSubjectiveEffects(subjectiveEffects)) {
      errors.push(`${draft.slug}: subjective_effects empty after write`);
      continue;
    }
    if (subjectiveEffects.attribution?.url !== draft.archive_url) {
      errors.push(`${draft.slug}: attribution URL mismatch after write`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Verification failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  console.log(`Verification: ok (${drafts.length}/${drafts.length} slugs have non-empty subjective_effects and exact archive attribution URLs)`);
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseOptions(argv);

  if (options.help) {
    printHelp();
    return;
  }

  const runContext = createDataOpsRunContext({
    operation: "apply archived subjective effects import",
    intent: "editorArticleWrite",
    argv,
    sourceUrlKeys: [],
    targetUrlKeys: ["TARGET_POSTGRES_URL", "POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL", "POSTGRES_POOLED_URL"],
    dryRunFlag: "--dry-run",
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: "--confirm-subjective-effects-write",
    selectedTables: ["substanceIndex"],
    localArtifacts: [options.jsonDir, options.trackerPath],
    destructive: true,
  });

  if (!options.write) {
    runContext.dryRun = true;
    runContext.writeEnabled = false;
  }

  const drafts = loadAndValidateDrafts({
    jsonDir: options.jsonDir,
    trackerPath: options.trackerPath,
    slug: options.slug,
    expectDbStatus: options.expectDbStatus,
  });

  if (options.validateOnly) {
    return;
  }

  printDataOpsRunContext(runContext);
  const targetUrl = requireTargetUrl(runContext, "Postgres subjective effects target URL");
  const client = createDataClient({ target: targetUrl }).client;

  if (options.verifyOnly) {
    await verifyImport({ client, drafts });
    return;
  }

  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage) as Record<string, unknown>[];
  console.log(`Fetched Postgres articles: ${articles.length}`);
  const { plans, errors } = planImport({ articles, drafts });
  printPlan(plans, errors);

  if (errors.length > 0) {
    throw new Error("Dry-run failed: plan has errors.");
  }

  if (!options.write) {
    const changedCount = plans.filter((plan) => plan.changed).length;
    if (changedCount === 0) {
      console.log("No writes needed. Target subjective_effects already match drafts.");
    } else {
      console.log("No writes performed. Re-run with --write --confirm-subjective-effects-write to update Postgres.");
    }
    return;
  }

  assertDataOpsWriteAllowed(runContext);

  const changed = plans.filter((plan) => plan.changed);
  if (changed.length === 0) {
    console.log("No writes performed. All target subjective_effects already match drafts.");
    await verifyImport({ client, drafts });
    return;
  }

  const audit = writeAuditLog({
    operation: "subjective-effects-archive-import",
    intent: "editorArticleWrite",
    mutations: changed.map((plan) => ({
      slug: plan.slug,
      path: "subjective_effects",
      affectedPaths: plan.affectedPaths,
    })),
  });
  console.log(`Audit log: ${audit.path}`);

  const backup = await backupBeforeWrite({
    sourceClient: client,
    queryAll: () => getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    label: "subjective-effects-archive-import-substanceIndex",
  });
  console.log(`Backup: ${backup.path} (${backup.documentCount} documents)`);

  const token = requireAdminIntentToken("editorArticleWrite");
  console.log(`Write auth: ${token.source} token (${token.envVar})`);
  const writeResult = await writePlans({ client, plans, token: token.token });
  const status = writeResult.errors.length > 0 || writeResult.skipped > 0 ? "failed" : "completed";

  updateAuditLog(audit.path, {
    result: {
      created: writeResult.created,
      updated: writeResult.updated,
      skipped: writeResult.skipped,
      errors: writeResult.errors,
    },
    backupPath: backup.path,
    status,
  });

  console.log(
    `Write result: created=${writeResult.created}, updated=${writeResult.updated}, skipped=${writeResult.skipped}, errors=${writeResult.errors.length}`,
  );

  if (writeResult.errors.length > 0 || writeResult.skipped > 0) {
    throw new Error(`Write did not complete cleanly. errors=${writeResult.errors.length}, skipped=${writeResult.skipped}`);
  }

  await verifyImport({ client, drafts });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
