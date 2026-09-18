/**
 * Normalize microgram spellings in dose tables to the canonical micro sign (µg, U+00B5).
 *
 * Scope is deliberately structural — the opposite of a text sweep:
 *   - `dosage.routes[].dose_ranges.<tier>.unit` values that are exactly `ug` or `mcg`
 *     (case-insensitive, trimmed) become `µg`.
 *   - `dosage.routes[].notes` free text only where a number-anchored token matches
 *     (`4000 ug`, `100-200ug`); words like "drug" can never match.
 *
 * Every article is published atomically through `articleLifecycle:write` against a
 * fresh revision baseline, after refusing stale or reordered dosage plans.
 * Dry-run by default; live writes follow the shared data-ops ceremony.
 */
import { createDataClient, type DataClient } from "../lib/data-client.ts";
import type { FunctionArgs } from "../../lib/postgres/runtime/api.ts";
import { isDeepStrictEqual } from "node:util";
import { api } from "../../lib/postgres/runtime/api.ts";
import { drainDataPageQuery } from "../lib/data-pagination.mjs";
import { contentHash } from "../../lib/proposals/contentHash";
import { buildFieldPath, getArticleValueByPath, setArticleValueByPath } from "../../src/data/schema/fieldPath";
import { createDataOpsRunContext,
assertDataOpsWriteAllowed,
printDataOpsRunContext,
hasFlag,
requireAdminIntentToken,  } from "../lib/data-ops-run-context.mjs"; import { writeAuditLog, updateAuditLog } from "../lib/data-ops-audit.mjs"

const OPERATION = "normalize-dose-units";
const CONFIRMATION_FLAG = "--confirm-dose-units";
const CANONICAL_MICROGRAM = "µg"; // U+00B5 MICRO SIGN — matches DOSE_UNIT_ALIASES in scripts/parsers/base/dose.ts
const UNIT_VARIANTS = new Set(["ug", "mcg"]);
const NOTES_TOKEN_RE = /(\d)\s*(?:ug|mcg)\b/g;

export type DoseUnitEdit = {
  slug: string;
  path: string;
  kind: "unit" | "notes";
  before: unknown;
  after: unknown;
  expected: unknown;
};

type ArticleLike = {
  slug?: string;
  title?: string;
  dosage?: { routes?: Array<Record<string, unknown>> };
};

export function normalizeNotesText(text: string): string {
  return text.replace(NOTES_TOKEN_RE, (match, digit: string) => `${digit} ${CANONICAL_MICROGRAM}`);
}

export function planDoseUnitEdits(articles: ArticleLike[]): DoseUnitEdit[] {
  const edits: DoseUnitEdit[] = [];
  for (const article of articles) {
    const slug = article.slug ?? "";
    if (!slug) continue;
    const routes = article.dosage?.routes;
    if (!Array.isArray(routes)) continue;
    routes.forEach((route, routeIndex) => {
      const doseRanges = route.dose_ranges;
      if (doseRanges && typeof doseRanges === "object") {
        for (const [tier, range] of Object.entries(doseRanges)) {
          if (!range || typeof range !== "object" || !("unit" in range)) continue;
          const unit = range.unit;
          if (typeof unit !== "string") continue;
          if (!UNIT_VARIANTS.has(unit.trim().toLowerCase())) continue;
          edits.push({
            slug,
            path: buildFieldPath("dosage", "routes", routeIndex, "dose_ranges", tier),
            kind: "unit",
            before: unit,
            after: CANONICAL_MICROGRAM,
            expected: range,
          });
        }
      }
      const notes = route.notes;
      if (typeof notes === "string" && notes.length > 0) {
        const rewritten = normalizeNotesText(notes);
        if (rewritten !== notes) {
          edits.push({
            slug,
            path: buildFieldPath("dosage", "routes", routeIndex, "notes"),
            kind: "notes",
            before: notes,
            after: rewritten,
            expected: notes,
          });
        }
      }
    });
  }
  return edits;
}

function editValue(edit: DoseUnitEdit): unknown {
  if (edit.kind === "notes") return edit.after;
  if (!edit.expected || typeof edit.expected !== "object" || Array.isArray(edit.expected)) {
    throw new Error(`Invalid planned dose range: ${edit.slug} ${edit.path}`);
  }
  return { ...edit.expected, unit: CANONICAL_MICROGRAM };
}

function printPlan(edits: DoseUnitEdit[], logger: Pick<Console, "log">): void {
  const bySlug = new Map<string, DoseUnitEdit[]>();
  for (const edit of edits) {
    const list = bySlug.get(edit.slug) ?? [];
    list.push(edit);
    bySlug.set(edit.slug, list);
  }
  for (const [slug, slugEdits] of [...bySlug.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    logger.log(`\n${slug} (${slugEdits.length} edit${slugEdits.length === 1 ? "" : "s"})`);
    for (const edit of slugEdits) {
      if (edit.kind === "unit") {
        logger.log(`  ${edit.path}.unit: ${JSON.stringify(edit.before)} -> ${JSON.stringify(edit.after)}`);
      } else {
        logger.log(`  ${edit.path}: ${JSON.stringify(edit.before)}\n    -> ${JSON.stringify(edit.after)}`);
      }
    }
  }
  logger.log(`\nTotal: ${edits.length} edit(s) across ${bySlug.size} article(s).`);
}

type RunDependencies = {
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "log">;
  createClient?: (url: string) => Pick<DataClient, "mutation" | "query">;
  writeAudit?: typeof writeAuditLog;
  updateAudit?: typeof updateAuditLog;
};

export async function runNormalizeDoseUnits(
  argv: string[],
  {
    env = process.env,
    logger = console,
    createClient = (url) => createDataClient({ target: url }).client,
    writeAudit = writeAuditLog,
    updateAudit = updateAuditLog,
  }: RunDependencies = {},
): Promise<{ edits: DoseUnitEdit[]; auditLogPath?: string }> {
  const write = hasFlag(argv, "--write");
  const context = createDataOpsRunContext({
    operation: OPERATION,
    intent: "editorArticleWrite",
    argv,
    env,
    targetUrlKeys: ["TARGET_POSTGRES_URL"],
    dryRunFlag: "--dry-run",
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: CONFIRMATION_FLAG,
    selectedTables: ["substanceIndex"],
    localArtifacts: [],
    loadsEnvLocal: true,
    destructive: true,
  });
  if (!write) {
    context.dryRun = true;
    context.writeEnabled = false;
  }
  printDataOpsRunContext(context, { logger });

  // Read from the deployment being written so `expected` reflects that store; dry runs
  // fall back to the public read deployment.
  const readUrl = write
    ? context.targetUrl
    : (env.TARGET_POSTGRES_URL ?? env.POSTGRES_POOLED_URL ?? env.SOURCE_POSTGRES_URL);
  if (!readUrl) {
    throw new Error("No Postgres URL available. Set TARGET_POSTGRES_URL (writes) or POSTGRES_POOLED_URL / SOURCE_POSTGRES_URL (dry run).");
  }
  const client = createClient(readUrl);
  // Drain the bounded lookup projection in stable corpus order, then fetch one
  // article at a time so CAS snapshots come from the selected deployment.
  const lookup = await drainDataPageQuery({
    client,
    query: api.substanceIndex.getLookupPage,
  });
  const articles: ArticleLike[] = [];
  for (const item of lookup) {
    if (!item?.slug) continue;
    const article = await client.query(api.substanceIndex.getBySlug, { slug: item.slug });
    if (article) articles.push(article);
  }
  logger.log(`Read ${articles.length} article(s) from ${readUrl}.`);
  const edits = planDoseUnitEdits(articles);
  printPlan(edits, logger);

  if (!write) {
    logger.log(`\nDry run only. Re-run with --write ${CONFIRMATION_FLAG} --confirm-write=${context.operationName} --expected-deployment=<deployment>.`);
    return { edits };
  }

  assertDataOpsWriteAllowed(context);
  const token = requireAdminIntentToken("editorArticleWrite", { env });
  const bySlug = new Map<string, DoseUnitEdit[]>();
  for (const edit of edits) {
    const group = bySlug.get(edit.slug);
    if (group) group.push(edit);
    else bySlug.set(edit.slug, [edit]);
  }
  const audit = writeAudit({
    operation: OPERATION,
    intent: "editorArticleWrite",
    slug: OPERATION,
    mutations: [...bySlug].map(([slug, plannedEdits]) => ({ slug, action: "publish", edits: plannedEdits })),
    repoRoot: context.repoRoot,
  });
  const results: unknown[] = [];
  const operations: Array<Omit<FunctionArgs<typeof api.articleLifecycle.write>, "apiKey" | "actorEmail">> = [];
  let completed = 0;
  try {
    // Preflight the complete plan before any publication. The service token acts
    // as the workstation admin; do not invent a delegated member identity.
    const plannedArticles = new Map(articles.map((article) => [article.slug, article]));
    for (const [slug, plannedEdits] of bySlug) {
      const latest = await client.query(api.articleLifecycle.get, { apiKey: token.token, slug });
      const planned = plannedArticles.get(slug);
      if (!planned || !isDeepStrictEqual(latest.article.dosage, planned.dosage)) {
        throw new Error(`Stale dose-unit plan for ${slug}: dosage changed or routes were reordered. Re-run the dry run.`);
      }
      let dosage = latest.article.dosage;
      for (const edit of plannedEdits) {
        if (!isDeepStrictEqual(getArticleValueByPath(latest.article, edit.path), edit.expected)) {
          throw new Error(`Stale dose-unit plan for ${slug}: ${edit.path} no longer matches its planned value.`);
        }
        dosage = setArticleValueByPath(dosage, edit.path.slice("dosage.".length), editValue(edit));
      }
      const request = {
        slug,
        baseHash: latest.baseHash,
        article: { ...latest.article, dosage },
        summary: "Normalize microgram dose units and number-anchored route notes to µg.",
      };
      operations.push({
        ...request,
        action: "publish",
        changeId: `${OPERATION}:${contentHash(request)}`,
      });
    }
    // Persist the exact token-free requests before sending them, retaining stable
    // change IDs and baselines for safe receipt lookup after an ambiguous failure.
    updateAudit(audit.path, { status: "applying", operations });
    for (const operation of operations) {
      results.push(await client.mutation(api.articleLifecycle.write, { ...operation, apiKey: token.token }));
      completed += bySlug.get(operation.slug)?.length ?? 0;
    }
    updateAudit(audit.path, { status: "completed", results });
  } catch (error) {
    updateAudit(audit.path, {
      status: "failed",
      completed,
      completedArticles: results.length,
      results,
      operations,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  logger.log(`\nApplied ${edits.length} dose-unit edit(s). Audit log: ${audit.path}`);
  return { edits, auditLogPath: audit.path };
}

const isDirectExecution = process.argv[1]?.endsWith("normalize-dose-units.ts") ?? false;
if (isDirectExecution) {
  runNormalizeDoseUnits(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
