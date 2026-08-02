/**
 * Normalize microgram spellings in dose tables to the canonical micro sign (µg, U+00B5).
 *
 * Scope is deliberately structural — the opposite of a text sweep:
 *   - `dosage.routes[].dose_ranges.<tier>.unit` values that are exactly `ug` or `mcg`
 *     (case-insensitive, trimmed) become `µg`.
 *   - `dosage.routes[].notes` free text only where a number-anchored token matches
 *     (`4000 ug`, `100-200ug`); words like "drug" can never match.
 *
 * Every write goes through the allow-listed `substanceIndex:setArticleField` mutation
 * with the read value as `expected`, so concurrent edits are refused, never clobbered.
 * Dry-run by default; live writes follow the shared data-ops ceremony.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  createDataOpsRunContext,
  assertDataOpsWriteAllowed,
  printDataOpsRunContext,
  hasFlag,
  requireAdminIntentToken,
  writeAuditLog,
  updateAuditLog,
} from "../lib/data-ops-run-context.mjs";

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

type EditableFieldWriteValue = string | { unit: string; min: number; max: number };

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
        for (const [tier, range] of Object.entries(doseRanges as Record<string, unknown>)) {
          if (!range || typeof range !== "object") continue;
          const unit = (range as Record<string, unknown>).unit;
          if (typeof unit !== "string") continue;
          if (!UNIT_VARIANTS.has(unit.trim().toLowerCase())) continue;
          edits.push({
            slug,
            path: `dosage.routes.${routeIndex}.dose_ranges.${tier}`,
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
            path: `dosage.routes.${routeIndex}.notes`,
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
  return { ...(edit.expected as Record<string, unknown>), unit: CANONICAL_MICROGRAM };
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
  createClient?: (url: string) => Pick<ConvexHttpClient, "mutation" | "query">;
  writeAudit?: typeof writeAuditLog;
  updateAudit?: typeof updateAuditLog;
};

export async function runNormalizeDoseUnits(
  argv: string[],
  {
    env = process.env,
    logger = console,
    createClient = (url) => new ConvexHttpClient(url),
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
    targetUrlKeys: ["TARGET_CONVEX_URL"],
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
    : (env.TARGET_CONVEX_URL ?? env.VITE_CONVEX_URL ?? env.CONVEX_PUBLIC_READ_URL);
  if (!readUrl) {
    throw new Error("No Convex URL available. Set TARGET_CONVEX_URL (writes) or VITE_CONVEX_URL / CONVEX_PUBLIC_READ_URL (dry run).");
  }
  const client = createClient(readUrl);
  const articles = (await client.query(api.substanceIndex.getAll, {})) as ArticleLike[];
  const edits = planDoseUnitEdits(articles);
  printPlan(edits, logger);

  if (!write) {
    logger.log(`\nDry run only. Re-run with --write ${CONFIRMATION_FLAG} --confirm-write=${context.operationName} --expected-deployment=<deployment>.`);
    return { edits };
  }

  assertDataOpsWriteAllowed(context);
  const token = requireAdminIntentToken("editorArticleWrite", { env });
  const audit = writeAudit({
    operation: OPERATION,
    intent: "editorArticleWrite",
    slug: OPERATION,
    mutations: edits.map(({ slug, path, kind }) => ({ slug, action: "set_article_field", path, kind })),
    repoRoot: context.repoRoot,
  });
  const results: unknown[] = [];
  try {
    for (const edit of edits) {
      results.push(
        await client.mutation(api.substanceIndex.setArticleField, {
          apiKey: token.token,
          slug: edit.slug,
          path: edit.path,
          value: editValue(edit) as unknown as EditableFieldWriteValue,
          expected: edit.expected as unknown as EditableFieldWriteValue,
        }),
      );
    }
    updateAudit(audit.path, { status: "completed", results });
  } catch (error) {
    updateAudit(audit.path, {
      status: "failed",
      completed: results.length,
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
