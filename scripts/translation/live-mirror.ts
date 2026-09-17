/**
 * Operator surface for the live locale mirrors (`lib/translation/`).
 *
 * The cron keeps mirrors current after editorial writes; this script covers
 * everything else: seeding the store from a finished batch run, enqueuing
 * articles by hand, working the queue locally, and replaying rows whose prompt
 * digest is no longer the current one.
 *
 * Usage (Postgres write ceremony from docs/operations/data-credentials.md):
 *   export DATA_BACKEND=postgres TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL" POSTGRES_IMPORT_CONFIRM=<host>
 *   bun scripts/translation/live-mirror.ts import --run=notes-and-plans/exports/translation/zh-Hans/substances --allow-remote --write
 *   bun scripts/translation/live-mirror.ts import --run=notes-and-plans/exports/translation/zh-Hans/articles --corpus=articles --allow-remote --write
 *   bun scripts/translation/live-mirror.ts enqueue --all --allow-remote --write
 *   bun scripts/translation/live-mirror.ts enqueue --kind=library --all --allow-remote --write
 *   bun scripts/translation/live-mirror.ts enqueue --kind=replication --all --allow-remote --write
 *   bun scripts/translation/live-mirror.ts enqueue --slug=2c-b,lsd --allow-remote --write
 *   bun scripts/translation/live-mirror.ts run --limit=20 --allow-remote --write
 *   bun scripts/translation/live-mirror.ts backfill --kind=replication --allow-remote --write
 *   bun scripts/translation/live-mirror.ts stale --allow-remote --write
 *   bun scripts/translation/live-mirror.ts stale --term=Entactogen --term="Come Up" --allow-remote --write
 *
 * Commands:
 *   import   Load a batch run's translations.jsonl into translationSegments.
 *            Rows that failed a blocking gate in the run are skipped. The
 *            store keys segments by locale and source hash, so --corpus only
 *            names the segmenter that recovers each hash's source text.
 *   enqueue  Insert translation jobs for --all public slugs or --slug=a,b.
 *            --kind selects the corpus: article (substances, the default),
 *            effect, report, library (the long-form /articles archive), or
 *            replication (published gallery media; only titles translate).
 *   run      Claim and process due jobs, like the cron, until --limit or none.
 *   backfill Translate every unit the store lacks across all public records of
 *            --kind (or every kind) in bulk: units dedupe across records and
 *            travel in full batches, so a new kind or corpus field lands in
 *            minutes rather than one job at a time. Rejections are recorded.
 *   stale    Retranslate stored rows whose prompt digest differs from today's.
 *            With --term (repeatable), after a glossary edit: only rows whose
 *            English mentions a term (whole word, case insensitive, the
 *            prompt's own matcher) are marked and replayed; every other row
 *            on an older digest is restamped with the current one, since a
 *            segment without the term gets a byte-identical prompt. Use the
 *            plain form after a system prompt change.
 *   status   Counts only; never writes.
 *
 * Without --write every command reports what it would do and exits.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { getPublicDataReadAdapter } from "../../lib/data/publicData.reads";
import { getPostgresClient } from "../../lib/postgres/runtime/backend";
import * as live from "../../lib/translation/liveTranslation";
import * as store from "../../lib/translation/segmentStore";
import { CORPORA } from "./corpora.mjs";
import type { WorkUnit } from "./engine.mjs";
import { guardTarget } from "../postgres/targetGuard";
import { extractSegments, buildWorkUnits, type Segment } from "./segment-manifest.mjs";
import { isBlocking } from "./validate.mjs";

const LOCALE = "zh-Hans";
/** Units per translateUnits call and calls in flight during a stale replay: 6 x 8 requests at most. */
const STALE_CHUNK = 200;
const STALE_CONCURRENCY = 6;

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
    term: { type: "string", multiple: true, default: [] },
    target: { type: "string" },
    write: { type: "boolean", default: false },
    "allow-remote": { type: "boolean", default: false },
  },
});

const command = positionals[0];
const target = values.target ?? process.env.TARGET_POSTGRES_URL;
if (!command || !["import", "enqueue", "run", "backfill", "stale", "status"].includes(command)) {
  throw new Error("Usage: live-mirror.ts <import|enqueue|run|backfill|stale|status> [options]");
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
const context = await live.loadTranslationContext(LOCALE);
const promptVersion = context.promptVersion;

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

function requireKind(value: string): live.TranslationRecordKind {
  if (!live.TRANSLATION_RECORD_KINDS.includes(value as live.TranslationRecordKind)) {
    throw new Error(`Unknown --kind: ${value} (expected one of ${live.TRANSLATION_RECORD_KINDS.join(", ")})`);
  }
  return value as live.TranslationRecordKind;
}

async function enqueue() {
  const kind = requireKind(values.kind);
  let bare: string[];
  if (values.all) {
    bare = await live.publicRecordSlugs(getPublicDataReadAdapter(), kind);
  } else if (values.slug) {
    bare = values.slug.split(",").map((slug) => slug.trim()).filter(Boolean);
  } else {
    throw new Error("enqueue needs --all or --slug=a,b");
  }
  const slugs = bare.map((slug) => live.translationJobSlug(kind, slug));
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
    const due = await getPostgresClient().sql<{ n: string }>(
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
          const completed = await store.completeTranslationJob(job);
          console.log(`  ${job.slug}: ${completed ? "not public, cleared" : "superseded lease, left pending"}`);
          continue;
        }
        const outcome = await live.refreshRecordTranslations({ ...record, slug }, context, kind, apiKey);
        if (outcome.rejected.length > 0) throw new Error(`Translation refresh rejected ${outcome.rejected.length} segments`);
        if (!await store.completeTranslationJob(job)) throw new Error("Translation lease was superseded");
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

async function backfill() {
  const kinds = values.kind === "article" && !process.argv.some((arg) => arg.startsWith("--kind"))
    ? live.TRANSLATION_RECORD_KINDS
    : [requireKind(values.kind)];
  const reads = getPublicDataReadAdapter();
  const unitsByHash = new Map<string, WorkUnit>();
  let records = 0;
  for (const kind of kinds) {
    for (const record of await live.publicRecords(reads, kind)) {
      records += 1;
      for (const unit of live.workUnitsOf(live.segmentsOf(record, kind), kind)) {
        const known = unitsByHash.get(unit.hash);
        // A hash seen once as safety text keeps that reminder everywhere.
        if (!known || (unit.contextClass === "safety" && known.contextClass !== "safety")) unitsByHash.set(unit.hash, unit);
      }
    }
  }
  const missing = new Set(await store.missingTranslationHashes(LOCALE, [...unitsByHash.keys()]));
  const pending = [...unitsByHash.values()].filter((unit) => missing.has(unit.hash));
  console.log(`Records       ${records} across ${kinds.join(", ")}`);
  console.log(`Units         ${unitsByHash.size} unique, ${pending.length} missing`);
  if (pending.length === 0) return;
  if (!write) {
    console.log("Dry run: pass --write to translate.");
    return;
  }
  const apiKey = requireApiKey();
  let stored = 0;
  let rejected = 0;
  for (let start = 0; start < pending.length; start += 200) {
    const result = await live.translateUnits(pending.slice(start, start + 200), context, apiKey);
    stored += result.stored;
    rejected += result.rejected.length;
    console.log(`  ${Math.min(start + 200, pending.length)}/${pending.length}: ${result.stored} stored, ${result.rejected.length} rejected`);
  }
  console.log(`Backfill      ${stored} stored, ${rejected} rejected (see mirror-coverage.ts store for the defects)`);
  console.log("Caches on the public deployments expire on the next editorial publish or ISR interval.");
}

async function retranslateStale() {
  const terms = values.term.map((term) => term.trim()).filter(Boolean);
  if (terms.length > 0) {
    const mentioning = await store.readTranslationsMentioning(LOCALE, terms);
    console.log(`Matched rows  ${mentioning.length} mentioning ${terms.map((term) => JSON.stringify(term)).join(", ")}`);
    if (mentioning.length === 0) return;
    if (!write) {
      console.log("Dry run: pass --write to mark them stale, restamp the rest, and retranslate.");
      return;
    }
    const scoped = await store.scopeStaleTranslations(LOCALE, mentioning.map((row) => row.hash), promptVersion);
    console.log(`Scoped        ${scoped.marked} marked stale, ${scoped.restamped} restamped to ${promptVersion}`);
  }
  const hashes = await store.readStaleTranslationHashes(LOCALE, promptVersion);
  console.log(`Stale rows    ${hashes.length} (prompt digest != ${promptVersion})`);
  if (hashes.length === 0) return;
  if (!write) {
    console.log("Dry run: pass --write to retranslate.");
    return;
  }
  const apiKey = requireApiKey();
  const rows = await getPostgresClient().sql<{ hash: string; source: string }>(
    'SELECT "hash", "source" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])',
    [LOCALE, hashes],
  );
  // Context class and markup are not stored; rebuild them by re-segmenting
  // the live corpus of every kind so safety segments keep their reminder and
  // markup segments keep their gate. Segments no longer in any record are
  // translated as plain prose, which is harmless: they render nowhere.
  const reads = getPublicDataReadAdapter();
  const segmentByHash = new Map<string, Pick<Segment, "contextClass" | "markup"> & { kind: live.TranslationRecordKind }>();
  for (const kind of live.TRANSLATION_RECORD_KINDS) {
    for (const record of await live.publicRecords(reads, kind)) {
      for (const segment of live.segmentsOf(record, kind)) {
        const known = segmentByHash.get(segment.hash);
        if (!known || (segment.contextClass === "safety" && known.contextClass !== "safety")) {
          segmentByHash.set(segment.hash, { contextClass: segment.contextClass, markup: segment.markup, kind });
        }
      }
    }
  }
  const units = buildWorkUnits(rows.map((row) => {
    const known = segmentByHash.get(row.hash);
    return {
      slug: "", path: "", pointer: [], group: "",
      markup: known?.markup ?? false,
      contextClass: known?.contextClass ?? "prose",
      hash: row.hash, words: row.source.trim().split(/\s+/).length, source: row.source,
    };
  })).map((unit) => ({ ...unit, contextKind: segmentByHash.get(unit.hash)?.kind ?? "any" }));
  // Each chunk is one translateUnits call with its own request pool; several
  // chunks in flight keep the model busy across a whole-corpus replay. A chunk
  // whose write fails (the pooler dropping a connection mid-statement) simply
  // stays stale for the next run instead of ending the replay.
  const chunks: (typeof units)[] = [];
  for (let start = 0; start < units.length; start += STALE_CHUNK) chunks.push(units.slice(start, start + STALE_CHUNK));
  let cursor = 0;
  let done = 0;
  let failed = 0;
  await Promise.all(Array.from({ length: Math.min(STALE_CONCURRENCY, chunks.length) }, async () => {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor];
      cursor += 1;
      try {
        const result = await live.translateUnits(chunk, context, apiKey);
        done += chunk.length;
        console.log(`  ${done}/${units.length}: ${result.stored} stored, ${result.rejected.length} rejected`);
      } catch (error) {
        failed += chunk.length;
        console.log(`  chunk of ${chunk.length} failed, still stale: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }));
  if (failed > 0) {
    console.log(`Still stale   ${failed} unit(s) after failed chunks; run stale again`);
    process.exitCode = 1;
  }
}

async function status() {
  const client = getPostgresClient();
  const segments = await store.translationSegmentCounts(LOCALE, promptVersion);
  const [jobs] = await client.sql<{ due: string; done: string; failing: string }>(
    `SELECT COUNT(*) FILTER (WHERE "completed_at" IS NULL)::text AS due,
            COUNT(*) FILTER (WHERE "completed_at" IS NOT NULL)::text AS done,
            COUNT(*) FILTER (WHERE "last_error" IS NOT NULL)::text AS failing
     FROM "translationJobs" WHERE "locale" = $1`,
    [LOCALE],
  );
  console.log(`Locale        ${LOCALE}`);
  console.log(`Prompt        ${promptVersion} (${Object.keys(context.glossary).length} approved glossary terms)`);
  console.log(`Segments      ${segments.total} stored, ${segments.current} on the current prompt`);
  console.log(`Jobs          ${jobs?.due ?? 0} due, ${jobs?.done ?? 0} completed, ${jobs?.failing ?? 0} carrying an error`);
}

try {
  if (command === "import") await importRun();
  else if (command === "enqueue") await enqueue();
  else if (command === "run") await runQueue();
  else if (command === "backfill") await backfill();
  else if (command === "stale") await retranslateStale();
  else await status();
} finally {
  await getPostgresClient().end();
}
