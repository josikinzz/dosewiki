/**
 * Operator surface for the live locale mirrors (`lib/translation/`).
 *
 * The cron keeps mirrors current after editorial writes; this script covers
 * everything else: seeding the store from a finished batch run, enqueuing
 * articles by hand, working the queue locally, and replaying rows whose prompt
 * digest is no longer the current one.
 *
 * Usage (Postgres write ceremony from docs/agents/convex-credentials.md):
 *   export DATA_BACKEND=postgres TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL" POSTGRES_IMPORT_CONFIRM=<host>
 *   bun scripts/translation/live-mirror.ts import --run=notes-and-plans/exports/translation/zh-Hans/substances --allow-remote --write
 *   bun scripts/translation/live-mirror.ts import --run=notes-and-plans/exports/translation/zh-Hans/articles --corpus=articles --allow-remote --write
 *   bun scripts/translation/live-mirror.ts enqueue --all --allow-remote --write
 *   bun scripts/translation/live-mirror.ts enqueue --kind=library --all --allow-remote --write
 *   bun scripts/translation/live-mirror.ts enqueue --slug=2c-b,lsd --allow-remote --write
 *   bun scripts/translation/live-mirror.ts run --limit=20 --allow-remote --write
 *   bun scripts/translation/live-mirror.ts stale --allow-remote --write
 *
 * Commands:
 *   import   Load a batch run's translations.jsonl into translationSegments.
 *            Rows that failed a blocking gate in the run are skipped. The
 *            store keys segments by locale and source hash, so --corpus only
 *            names the segmenter that recovers each hash's source text.
 *   enqueue  Insert translation jobs for --all public slugs or --slug=a,b.
 *            --kind selects the corpus: article (substances, the default),
 *            effect, report, or library (the long-form /articles archive).
 *   run      Claim and process due jobs, like the cron, until --limit or none.
 *   stale    Retranslate stored rows whose prompt digest differs from today's.
 *   status   Counts only; never writes.
 *
 * Without --write every command reports what it would do and exits.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { getPublicDataReadAdapter } from "../../lib/convex/publicData.reads";
import { getPostgresConvexClient } from "../../lib/postgres/runtime/backend";
import * as live from "../../lib/translation/liveTranslation";
import * as store from "../../lib/translation/segmentStore";
import { CORPORA } from "./corpora.mjs";
import { guardTarget } from "../postgres/targetGuard";
import { extractSegments, buildWorkUnits, type Segment } from "./segment-manifest.mjs";
import { isBlocking } from "./validate.mjs";

const LOCALE = "zh-Hans";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    run: { type: "string" },
    slug: { type: "string" },
    all: { type: "boolean", default: false },
    corpus: { type: "string", default: "substances" },
    kind: { type: "string", default: "article" },
    limit: { type: "string", default: "50" },
    target: { type: "string" },
    write: { type: "boolean", default: false },
    "allow-remote": { type: "boolean", default: false },
  },
});

const command = positionals[0];
const target = values.target ?? process.env.TARGET_POSTGRES_URL;
if (!command || !["import", "enqueue", "run", "stale", "status"].includes(command)) {
  throw new Error("Usage: live-mirror.ts <import|enqueue|run|stale|status> [options]");
}
if (!target) throw new Error("Pass --target <url> or set TARGET_POSTGRES_URL");
guardTarget(target, values["allow-remote"]);

// The store reads the app's connection variables lazily; a script points them
// at the explicit target only, so the app fallbacks never select a writer here.
process.env.DATA_BACKEND = "postgres";
process.env.POSTGRES_POOLED_URL = target;
delete process.env.POSTGRES_DIRECT_URL;

const write = values.write;
const limit = Number(values.limit);
const promptVersion = live.promptVersionFor(live.getTranslationLocale(LOCALE));

function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required to call the model");
  return apiKey;
}

async function importRun() {
  const runDir = values.run;
  if (!runDir) throw new Error("import needs --run=<batch run directory>");
  const exportPath = path.resolve(runDir, "source-export.json");
  const checkpointPath = path.resolve(runDir, "translations.jsonl");
  if (!existsSync(exportPath) || !existsSync(checkpointPath)) {
    throw new Error(`${runDir} lacks source-export.json or translations.jsonl`);
  }

  const corpusId = values.corpus;
  const corpus = CORPORA[corpusId as keyof typeof CORPORA];
  if (!corpus) throw new Error(`Unknown corpus: ${corpusId}`);

  const dataset = JSON.parse(await readFile(exportPath, "utf8"));
  const { segments } = extractSegments(dataset, corpus);
  const sourceByHash = new Map<string, string>(segments.map((segment: Segment) => [segment.hash, segment.source]));

  const rows = new Map<string, { target: string }>();
  let rejected = 0;
  let unknown = 0;
  for (const line of (await readFile(checkpointPath, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as { hash: string; target: string; defects?: string[] };
    if (!entry.target || isBlocking(entry.defects ?? [])) {
      rejected += 1;
      continue;
    }
    if (!sourceByHash.has(entry.hash)) {
      unknown += 1;
      continue;
    }
    rows.set(entry.hash, { target: entry.target });
  }

  console.log(`Run           ${runDir}`);
  console.log(`Checkpoint    ${rows.size} usable, ${rejected} rejected, ${unknown} without a source segment`);
  console.log(`Prompt        ${promptVersion} (stamped on every imported row)`);
  if (!write) {
    console.log("Dry run: pass --write to import.");
    return;
  }

  const batch = [...rows].map(([hash, { target }]) => ({
    locale: LOCALE,
    hash,
    source: sourceByHash.get(hash)!,
    target,
    model: live.TRANSLATION_MODEL,
    prompt_version: promptVersion,
  }));
  for (let start = 0; start < batch.length; start += 2000) {
    await store.writeTranslations(batch.slice(start, start + 2000));
    console.log(`  wrote ${Math.min(start + 2000, batch.length)}/${batch.length}`);
  }
}

const RECORD_KINDS: readonly live.TranslationRecordKind[] = ["article", "effect", "report", "library"];

function requireKind(value: string): live.TranslationRecordKind {
  if (!RECORD_KINDS.includes(value as live.TranslationRecordKind)) {
    throw new Error(`Unknown --kind: ${value} (expected one of ${RECORD_KINDS.join(", ")})`);
  }
  return value as live.TranslationRecordKind;
}

async function publicSlugsOf(kind: live.TranslationRecordKind): Promise<string[]> {
  const reads = getPublicDataReadAdapter();
  switch (kind) {
    case "article":
      return reads.getPublicSubstanceSlugs();
    case "effect":
      return (await reads.getPublicEffects()).map(({ slug }) => slug);
    case "report":
      return (await reads.getPublicTripReportRecords()).map(({ slug }) => slug);
    case "library":
      return (await reads.getPublishedEffectIndexArticles())
        .filter((article) => article.kind !== "blog")
        .map(({ slug }) => slug);
  }
}

async function enqueue() {
  const kind = requireKind(values.kind);
  const prefix = kind === "article" ? "" : `${kind}/`;
  let bare: string[];
  if (values.all) {
    bare = await publicSlugsOf(kind);
  } else if (values.slug) {
    bare = values.slug.split(",").map((slug) => slug.trim()).filter(Boolean);
  } else {
    throw new Error("enqueue needs --all or --slug=a,b");
  }
  const slugs = bare.map((slug) => `${prefix}${slug}`);
  console.log(`Enqueue       ${slugs.length} ${kind}(s) for ${LOCALE}`);
  if (!write) {
    console.log("Dry run: pass --write to enqueue.");
    return;
  }
  await store.enqueueTranslationJobs([LOCALE], slugs);
}

async function runQueue() {
  const apiKey = write ? requireApiKey() : "";
  const reads = getPublicDataReadAdapter();
  let processed = 0;
  if (!write) {
    const due = await getPostgresConvexClient().sql<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM "translationJobs" WHERE "completed_at" IS NULL',
    );
    console.log(`Due jobs      ${due[0]?.n ?? 0}`);
    console.log("Dry run: pass --write to process them.");
    return;
  }
  while (processed < limit) {
    const jobs = await store.claimTranslationJobs(Math.min(3, limit - processed));
    if (jobs.length === 0) break;
    for (const job of jobs) {
      processed += 1;
      try {
        const { kind, slug } = live.parseTranslationJobSlug(job.slug);
        const record = await live.readTranslationRecord(reads, kind, slug);
        if (!record) {
          await store.completeTranslationJob(job);
          console.log(`  ${job.slug}: not public, cleared`);
          continue;
        }
        const outcome = await live.refreshRecordTranslations({ ...record, slug }, job.locale, kind, apiKey);
        await store.completeTranslationJob(job);
        console.log(
          `  ${job.slug}: ${outcome.segments} segments, ${outcome.requested} requested, ${outcome.stored} stored, ${outcome.rejected.length} rejected, ${outcome.usage.requests} requests`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await store.failTranslationJob(job, message);
        console.log(`  ${job.slug}: failed: ${message}`);
      }
    }
  }
  console.log(`Processed     ${processed} job(s)`);
  console.log("Caches on the public deployments expire on the next editorial publish or ISR interval; run the cron or the revalidate route for an immediate refresh.");
}

async function retranslateStale() {
  const hashes = await store.readStaleTranslationHashes(LOCALE, promptVersion);
  console.log(`Stale rows    ${hashes.length} (prompt digest != ${promptVersion})`);
  if (hashes.length === 0) return;
  if (!write) {
    console.log("Dry run: pass --write to retranslate.");
    return;
  }
  const apiKey = requireApiKey();
  const rows = await getPostgresConvexClient().sql<{ hash: string; source: string }>(
    'SELECT "hash", "source" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])',
    [LOCALE, hashes],
  );
  // Context class is not stored; rebuild it by re-segmenting the live corpus so
  // safety segments keep their reminder. Segments no longer in any article
  // are translated as prose, which is harmless: they render nowhere.
  const classByHash = new Map<string, "safety" | "prose">();
  const documents = await getPublicDataReadAdapter().getPublicFullSubstanceDocuments();
  for (const segment of extractSegments({ items: documents as unknown as Record<string, unknown>[] }).segments) {
    if (segment.contextClass === "safety" || !classByHash.has(segment.hash)) classByHash.set(segment.hash, segment.contextClass);
  }
  const units = buildWorkUnits(rows.map((row) => ({
    slug: "", path: "", pointer: [], group: "", markup: false,
    contextClass: classByHash.get(row.hash) ?? "prose",
    hash: row.hash, words: row.source.trim().split(/\s+/).length, source: row.source,
  })));
  for (let start = 0; start < units.length; start += 200) {
    const result = await live.translateUnits(units.slice(start, start + 200), LOCALE, apiKey);
    console.log(`  ${Math.min(start + 200, units.length)}/${units.length}: ${result.stored} stored, ${result.rejected.length} rejected`);
  }
}

async function status() {
  const client = getPostgresConvexClient();
  const [segments] = await client.sql<{ n: string; current: string }>(
    'SELECT COUNT(*)::text AS n, COUNT(*) FILTER (WHERE "prompt_version" = $2)::text AS current FROM "translationSegments" WHERE "locale" = $1',
    [LOCALE, promptVersion],
  );
  const [jobs] = await client.sql<{ due: string; done: string; failing: string }>(
    `SELECT COUNT(*) FILTER (WHERE "completed_at" IS NULL)::text AS due,
            COUNT(*) FILTER (WHERE "completed_at" IS NOT NULL)::text AS done,
            COUNT(*) FILTER (WHERE "last_error" IS NOT NULL)::text AS failing
     FROM "translationJobs" WHERE "locale" = $1`,
    [LOCALE],
  );
  console.log(`Locale        ${LOCALE}`);
  console.log(`Prompt        ${promptVersion}`);
  console.log(`Segments      ${segments?.n ?? 0} stored, ${segments?.current ?? 0} on the current prompt`);
  console.log(`Jobs          ${jobs?.due ?? 0} due, ${jobs?.done ?? 0} completed, ${jobs?.failing ?? 0} carrying an error`);
}

try {
  if (command === "import") await importRun();
  else if (command === "enqueue") await enqueue();
  else if (command === "run") await runQueue();
  else if (command === "stale") await retranslateStale();
  else await status();
} finally {
  await getPostgresConvexClient().end();
}
