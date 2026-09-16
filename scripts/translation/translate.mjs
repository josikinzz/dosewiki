#!/usr/bin/env node
/**
 * Translate the published SubstanceIndex export into one locale.
 *
 * Reads the open-data export, extracts translatable segments, sends deduplicated
 * work units through OpenRouter, validates every returned segment, retries the
 * defective ones alone, and reassembles a same-structure locale artifact plus a
 * QA packet.
 *
 * Nothing here writes Postgres or Postgres. The input is the published export,
 * the glossary and its glosses are read from Postgres (`translationGlossary`
 * approved rows, `translationGlossaryTerms`), and the output is a local
 * artifact under notes-and-plans/exports.
 *
 * Usage:
 *   export OPENROUTER_API_KEY="sk-or-..."
 *   DATA_BACKEND=postgres bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/translate.mjs --locale=zh-Hans --slug=2c-b
 *   DATA_BACKEND=postgres bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/translate.mjs --locale=zh-Hans --concurrency=100 --resume
 *
 * Options:
 *   --locale=<code>        Target locale (zh-Hans, nl). Default zh-Hans.
 *   --slug=<a,b>           Restrict to these substance slugs (pilot runs).
 *   --limit=<n>            Stop after n work units (smoke runs).
 *   --concurrency=<n>      In-flight requests. Default 100.
 *   --model=<id>           OpenRouter model. Default z-ai/glm-5.3-flash.
 *   --batch-chars=<n>      Source characters per request. Default 6000.
 *   --source=<path|url>    Export location. Default the published open-data URL.
 *   --out=<dir>            Run directory. Default notes-and-plans/exports/translation/<locale>.
 *   --resume               Reuse checkpointed translations instead of recalling the model.
 *   --dry-run              Build the manifest and batches, call nothing.
 */

import { mkdir, readFile, writeFile, appendFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { Agent, setGlobalDispatcher } from "undici";

import { buildManifest, buildWorkUnits, assembleLocaleDataset, structuralDiff } from "./segment-manifest.mjs";
import { resolveCorpus } from "./corpora.mjs";
import { resolveLocale } from "./locales.mjs";
import { validateSegment, isBlocking, DEFECT_CODES } from "./validate.mjs";
import { buildQaPacket } from "./qa-packet.mjs";
import { DEFAULT_MODEL, planBatches, translateBatchWithRetries } from "./engine.mjs";
import { readGlossaryRows } from "../../lib/translation/glossary.ts";
import { loadGlosses } from "../../lib/translation/glossaryGloss.ts";
import { parseRawVCodeContent } from "../../src/features/effects/vcode/normalize.ts";

/**
 * The prompt context each batch corpus maps to (`kindInContext` in locales.mjs);
 * a corpus not listed here is translated unscoped, as every corpus was before.
 */
const CORPUS_CONTEXT_KIND = {
  substances: "article",
  effects: "effect",
  articles: "library",
  reports: "report",
  replications: "replication",
};

/**
 * Node's default dispatcher negotiates HTTP/2 with this endpoint and multiplexes
 * every request over a handful of connections. At this fan-out the streams
 * starve each other: a hundred requests in flight deliver a few completions a
 * minute while a single request on its own returns in seconds. One connection
 * per worker, over HTTP/1.1, keeps the pool honest. The timeouts recycle a
 * connection the far side has abandoned instead of parking a worker forever.
 */
setGlobalDispatcher(
  new Agent({
    allowH2: false,
    connections: 256,
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 120_000,
    headersTimeout: 300_000,
    bodyTimeout: 300_000,
  }),
);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** OpenRouter list price per million tokens, used for the run's cost report. */
const MODEL_PRICING = {
  "z-ai/glm-5.3-flash": { input: 0.075, output: 0.25 },
  "z-ai/glm-5.3": { input: 1.4, output: 4.4 },
  "z-ai/glm-4.7-flash": { input: 0.0605, output: 0.4 },
};


function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      locale: { type: "string", default: "zh-Hans" },
      corpus: { type: "string", default: "substances" },
      slug: { type: "string" },
      limit: { type: "string" },
      concurrency: { type: "string", default: "100" },
      model: { type: "string", default: DEFAULT_MODEL },
      "batch-chars": { type: "string", default: "6000" },
      source: { type: "string" },
      out: { type: "string" },
      resume: { type: "boolean", default: false },
      revalidate: { type: "boolean", default: false },
      reglossary: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const corpus = resolveCorpus(values.corpus);
  const outDir = values.out
    ? path.resolve(repoRoot, values.out)
    : path.join(repoRoot, "notes-and-plans/exports/translation", values.locale, corpus.id);

  return {
    locale: values.locale,
    corpus,
    slugs: values.slug ? values.slug.split(",").map((slug) => slug.trim()).filter(Boolean) : null,
    limit: values.limit ? Number(values.limit) : null,
    concurrency: Math.max(1, Number(values.concurrency)),
    model: values.model,
    batchChars: Math.max(500, Number(values["batch-chars"])),
    source: values.source ?? null,
    outDir,
    resume: values.resume,
    revalidate: values.revalidate,
    reglossary: values.reglossary,
    dryRun: values["dry-run"],
    help: values.help,
  };
}

async function loadCheckpoint(checkpointPath) {
  const done = new Map();
  if (!existsSync(checkpointPath)) return done;

  const content = await readFile(checkpointPath, "utf8");
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.hash && typeof record.target === "string") done.set(record.hash, record);
    } catch {
      // A partially written final line is expected after an interrupted run.
    }
  }
  return done;
}

function costOf(model, usage) {
  const price = MODEL_PRICING[model];
  if (!price) return 0;
  return (usage.prompt / 1e6) * price.input + (usage.completion / 1e6) * price.output;
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

async function runPool({ batches, concurrency, worker }) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
    while (cursor < batches.length) {
      const index = cursor;
      cursor += 1;
      await worker(batches[index], index);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(await readFile(fileURLToPath(import.meta.url), "utf8").then((text) => text.slice(0, text.indexOf(" */") + 3)));
    return;
  }

  const locale = resolveLocale(options.locale);
  const [approvedRows, glosses] = await Promise.all([readGlossaryRows(options.locale, { status: "approved" }), loadGlosses()]);
  const glossary = Object.fromEntries(approvedRows.map((row) => [row.term, row.target]));
  const kinds = Object.fromEntries(approvedRows.map((row) => [row.term, row.kind]));
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  await mkdir(options.outDir, { recursive: true });
  const checkpointPath = path.join(options.outDir, "translations.jsonl");
  const failurePath = path.join(options.outDir, "failures.jsonl");

  const { corpus } = options;
  const { dataset, origin } = await corpus.load(options.source);
  await writeFile(path.join(options.outDir, "source-export.json"), `${JSON.stringify(dataset)}\n`);
  const manifest = buildManifest(dataset, { locale: locale.code, source: origin, corpus });

  const segments = options.slugs
    ? manifest.segments.filter((segment) => options.slugs.includes(segment.slug))
    : manifest.segments;
  if (segments.length === 0) {
    console.error(`Error: no segments matched${options.slugs ? ` slugs ${options.slugs.join(",")}` : ""}`);
    process.exit(1);
  }

  const contextKind = CORPUS_CONTEXT_KIND[corpus.id];
  let units = buildWorkUnits(segments).map((unit) => (contextKind ? { ...unit, contextKind } : unit));
  if (options.limit) units = units.slice(0, options.limit);

  const checkpoint = options.resume ? await loadCheckpoint(checkpointPath) : new Map();

  // A gate that has since been corrected must not leave its verdict behind.
  // Re-judging the checkpoint against the current validator is free, and the
  // segments it rejects are the only ones worth paying the model for again.
  let revalidated = 0;
  if (options.revalidate && checkpoint.size > 0) {
    for (const unit of units) {
      const entry = checkpoint.get(unit.hash);
      if (!entry) continue;
      const evaluation = validateSegment({ source: unit.source, target: entry.target, locale, glossary, markup: unit.markup });
      if (isBlocking(evaluation.defects)) {
        checkpoint.delete(unit.hash);
        revalidated += 1;
        continue;
      }
      entry.defects = evaluation.defects;
    }
    // The queue on disk was written by the gates that just changed, and so
    // were the verdicts in the checkpoint: rewrite it, or the next plain
    // resume reloads the stale ones and reports them as failures again.
    await rm(failurePath, { force: true });
    await writeFile(checkpointPath, [...checkpoint.values()].map((entry) => `${JSON.stringify(entry)}\n`).join(""));
  }

  // A corpus translated before the glossary was frozen never saw the terms.
  // Dropping the segments that mention a frozen term without using its agreed
  // rendering sends exactly those back through, with the glossary in the
  // prompt this time. It is a preference, not a substitution: a genuine
  // homonym such as respiratory depression comes back reading the same, and
  // stays visible in the audit for a reader to settle.
  let reglossaried = 0;
  if (options.reglossary && checkpoint.size > 0) {
    for (const unit of units) {
      const entry = checkpoint.get(unit.hash);
      if (!entry || typeof entry.target !== "string") continue;
      const evaluation = validateSegment({ source: unit.source, target: entry.target, locale, glossary, markup: unit.markup });
      if (!evaluation.defects.includes(DEFECT_CODES.GLOSSARY_MISS)) continue;
      checkpoint.delete(unit.hash);
      reglossaried += 1;
    }
  }

  const pending = units.filter((unit) => !checkpoint.has(unit.hash));
  const batches = planBatches(pending, options.batchChars);

  const sourceChars = pending.reduce((total, unit) => total + unit.source.length, 0);
  console.log(`Locale        ${locale.code} (${locale.label})`);
  console.log(`Corpus        ${corpus.id} (${corpus.label})`);
  console.log(`Model         ${options.model}`);
  console.log(`Source        ${origin}`);
  console.log(`Items         ${new Set(segments.map((segment) => segment.slug)).size}`);
  console.log(`Segments      ${segments.length} (${units.length} unique)`);
  console.log(
    `Resumed       ${checkpoint.size}${revalidated > 0 ? ` (${revalidated} rejected on revalidation)` : ""}${reglossaried > 0 ? ` (${reglossaried} reopened for the glossary)` : ""}`,
  );
  console.log(`Pending       ${pending.length} units in ${batches.length} batches, ${sourceChars.toLocaleString()} chars`);

  if (options.dryRun) {
    await writeFile(path.join(options.outDir, "manifest.json"), `${JSON.stringify({ ...manifest, segments: undefined }, null, 2)}\n`);
    console.log("\nDry run: no model calls made.");
    return;
  }

  const translations = new Map([...checkpoint].map(([hash, record]) => [hash, record]));
  const failures = [];
  const usageTotal = { prompt: 0, completion: 0, requests: 0, retries: 0 };
  const started = Date.now();
  let completed = 0;
  let lastReport = 0;

  const record = async (unit, target, defects, details, attempts) => {
    const entry = {
      hash: unit.hash,
      target,
      defects,
      attempts,
      group: unit.group,
      contextClass: unit.contextClass,
    };
    translations.set(unit.hash, entry);
    await appendFile(checkpointPath, `${JSON.stringify(entry)}\n`);
    if (defects.length > 0 && isBlocking(defects)) {
      const failure = { hash: unit.hash, source: unit.source, target, defects, details, group: unit.group };
      failures.push(failure);
      await appendFile(failurePath, `${JSON.stringify(failure)}\n`);
    }
  };

  let inFlight = 0;
  let peakInFlight = 0;

  const worker = async (batch) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    let verdicts;
    try {
      verdicts = await translateBatchWithRetries({
        units: batch,
        locale,
        glossary,
        kinds,
        glosses,
        model: options.model,
        apiKey,
        onUsage: (usage, attempt) => {
          usageTotal.prompt += usage.prompt;
          usageTotal.completion += usage.completion;
          usageTotal.requests += 1;
          if (attempt > 1) usageTotal.retries += 1;
        },
      });
    } finally {
      inFlight -= 1;
    }

    for (const verdict of verdicts) {
      await record(verdict.unit, verdict.target, verdict.defects, verdict.details, verdict.attempts);
      completed += 1;
    }

    const now = Date.now();
    if (now - lastReport > 5000) {
      lastReport = now;
      const rate = completed / Math.max((now - started) / 1000, 1);
      const remaining = pending.length - completed;
      const cost = costOf(options.model, usageTotal);
      process.stdout.write(
        `  ${completed}/${pending.length} units · ${inFlight} in flight · ${failures.length} failed · ${rate.toFixed(1)}/s · eta ${formatDuration((remaining / Math.max(rate, 0.01)) * 1000)} · $${cost.toFixed(3)}\n`,
      );
    }
  };

  await runPool({ batches, concurrency: options.concurrency, worker });

  const elapsed = Date.now() - started;
  // A segment that failed a blocking gate keeps its English source in the
  // artifact. Serving a translation with a dropped dose is worse than serving
  // the sentence a reader can still check.
  const translationsByHash = new Map(
    [...translations]
      .filter(([, entry]) => !isBlocking(entry.defects ?? []))
      .map(([hash, entry]) => [hash, entry.target]),
  );
  const assembled = assembleLocaleDataset(dataset, segments, translationsByHash, {
    locale: locale.code,
    corpus,
    parse: parseRawVCodeContent,
  });
  // A derived tree is rebuilt from the shipped raw rather than compared to the
  // source tree string by string, so its own leaves are exempt from the
  // structural check that guards everything else.
  const derivedKeys = new Set(Object.values(corpus.markupFields ?? {}));
  const diff = structuralDiff(dataset.items, assembled.dataset.items, [], [], 25, derivedKeys);

  const artifactPath = path.join(options.outDir, `${corpus.dataset}.${locale.code}.json`);
  await writeFile(artifactPath, `${JSON.stringify(assembled.dataset, null, 1)}\n`);

  const packet = buildQaPacket({
    locale,
    glossary,
    model: options.model,
    manifest,
    segments,
    units,
    translations,
    failures,
    usage: usageTotal,
    cost: costOf(options.model, usageTotal),
    elapsedMs: elapsed,
    structuralDiff: diff,
    applied: assembled.applied,
    missing: assembled.missing,
    corpus,
    reconciliation: assembled.reconciliation,
  });

  await writeFile(path.join(options.outDir, "qa-packet.json"), `${JSON.stringify(packet, null, 2)}\n`);
  await writeFile(
    path.join(options.outDir, "manifest.json"),
    `${JSON.stringify({ ...manifest, segments: undefined, counts: { ...manifest.counts, runSegments: segments.length } }, null, 2)}\n`,
  );

  console.log(`\nDone in ${formatDuration(elapsed)}`);
  console.log(`  requests    ${usageTotal.requests} (${usageTotal.retries} retries)`);
  console.log(`  tokens      ${usageTotal.prompt.toLocaleString()} in / ${usageTotal.completion.toLocaleString()} out`);
  console.log(`  cost        $${costOf(options.model, usageTotal).toFixed(3)}`);
  console.log(`  coverage    ${packet.coverage.validatedPercent}% validated, ${failures.length} in the failure queue`);
  console.log(`  structure   ${diff.length === 0 ? "identical to source" : `${diff.length} MISMATCH`}`);
  if (assembled.reconciliation.bodies > 0) {
    const { bodies, rejected, reparsed } = assembled.reconciliation;
    console.log(`  bodies      ${bodies} reconciled, ${reparsed} trees rebuilt, ${rejected.length} rejected to English`);
    for (const entry of rejected.slice(0, 5)) {
      console.error(`  markup mismatch: ${entry.slug}.${entry.field} ${JSON.stringify(entry.firstDifference ?? entry)}`);
    }
  }
  console.log(`  artifact    ${path.relative(repoRoot, artifactPath)}`);

  if (diff.length > 0) {
    for (const line of diff.slice(0, 10)) console.error(`  structural mismatch: ${line}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exit(1);
  });
}
