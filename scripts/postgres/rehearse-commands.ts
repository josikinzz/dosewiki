/**
 * The operator command families run unchanged against
 * Postgres through scripts/lib/data-client.ts, and their guards hold.
 *
 *   bun scripts/postgres/rehearse-commands.ts --target postgres://localhost:5432/dosewiki [--allow-remote] [--keep]
 *
 * Every family is driven as a real subprocess (`bun scripts/<family>/<apply>`)
 * with DATA_BACKEND=postgres and TARGET_POSTGRES_URL pointing at the target,
 * against scratch rows this script creates (prefix `t17-` / `t18-`) and
 * deletes in `finally`. Per family it asserts, where the command has the
 * guard: dry run leaves the row untouched; a wrong `--expected-deployment` is
 * refused before any write; a missing approval flag is refused; stale live
 * content (the row edited after the artifact was reviewed) is refused; a
 * replay of the applied artifact is refused or settles without writing; and
 * the receipt / ledger / audit the command writes carries enough to reconcile.
 *
 * Families:
 *   citations   scripts/citations/verdict-apply.mjs
 *   legality    scripts/legality/apply-draft.mjs
 *   media-dates scripts/replications/apply-date-research.mjs  (intake/taxonomy ledger)
 *   media-rights scripts/replications/apply-artist-license.mjs (attribution)
 *   identity    scripts/contributors/apply-profile-patches.mjs (contributor identity)
 *   merge       the contributorProfileMerges approved-pair gate, exercised directly
 *               (the pinned one-off executor script has been retired).
 *
 * Report: runs/postgres-import/<timestamp>-commands/report.json. Scratch
 * artifacts (drafts, plans, ledgers) live under the same directory.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { api } from "../../lib/postgres/runtime/api";
import { documentHash } from "../../lib/postgres/documentCodec";
import { deleteDocument, insertDocument, mintDocumentId, patchDocument, selectDocumentById, selectDocuments } from "../../lib/postgres/documentStore";
import { tableColumns } from "../../lib/postgres/schema.generated";
import { minimalArticle } from "../../src/test/fixtures/articles";
import { DRAFT_SCHEMA_VERSION, buildPairId, contentHash } from "../citations/verdict-lib.mjs";
import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { resolveAdminIntentToken } from "../lib/data-ops-run-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WRONG_DEPLOYMENT = "wrong-deployment-000";
const UNREACHABLE = "http://127.0.0.1:9/";

type Check = { family: string; check: string; pass: boolean; detail?: unknown };
const checks: Check[] = [];
function expect(family: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ family, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${family}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail).slice(0, 600)}`}`);
}

type Run = { status: number | null; stdout: string; stderr: string; output: string };

function tail(text: string, lines = 6): string {
  return text.trim().split("\n").slice(-lines).join("\n");
}

function token(intent: string): string {
  const resolved = resolveAdminIntentToken(intent) as { token: string } | null;
  if (!resolved) throw new Error(`No admin token for ${intent} in the environment`);
  return resolved.token;
}

type ScratchRow = { table: keyof typeof tableColumns; id: string };

class Rehearsal {
  readonly pool: Pool;
  readonly target: string;
  readonly fingerprint: string;
  readonly runDirectory: string;
  readonly scratch: ScratchRow[] = [];
  readonly scratchSlugs: string[] = [];
  readonly scratchKeys: string[] = [];
  readonly env: NodeJS.ProcessEnv;

  constructor(target: string, runDirectory: string) {
    this.target = target;
    this.fingerprint = postgresFingerprintFromUrl(target) as string;
    this.pool = new Pool({ connectionString: target, max: 4 });
    this.runDirectory = runDirectory;
    const env: NodeJS.ProcessEnv = { ...process.env, DATA_BACKEND: "postgres", TARGET_POSTGRES_URL: target, DOSEWIKI_REVALIDATE_URL: UNREACHABLE };
    for (const key of Object.keys(env)) {
      // Only the explicit rehearsal target may be reachable from a Postgres rehearsal.
      if (key === "POSTGRES_POOLED_URL" || key === "POSTGRES_DIRECT_URL") delete env[key];
    }
    this.env = env;
  }

  run(script: string, args: string[]): Run {
    const result = spawnSync("bun", [script, ...args], { cwd: ROOT, encoding: "utf8", env: this.env, timeout: 180_000 });
    if (result.error) throw result.error;
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}` };
  }

  refused(family: string, check: string, run: Run, pattern: RegExp): void {
    const pass = run.status !== 0 && pattern.test(run.output);
    expect(family, check, pass, pass ? undefined : { status: run.status, tail: tail(run.output) });
  }

  succeeded(family: string, check: string, run: Run, pattern?: RegExp): void {
    const pass = run.status === 0 && (!pattern || pattern.test(run.output));
    expect(family, check, pass, pass ? undefined : { status: run.status, tail: tail(run.output, 12) });
  }

  async insert(table: keyof typeof tableColumns, document: Record<string, unknown>): Promise<string> {
    const id = await insertDocument(this.pool, table, document);
    this.scratch.push({ table, id });
    if (typeof document.slug === "string") this.scratchSlugs.push(document.slug);
    if (typeof document.key === "string") this.scratchKeys.push(document.key);
    return id;
  }

  async hash(table: keyof typeof tableColumns, id: string): Promise<string | null> {
    const document = await selectDocumentById(this.pool, table, id);
    return document ? documentHash(document) : null;
  }

  async get(table: keyof typeof tableColumns, id: string): Promise<Record<string, unknown> | null> {
    return (await selectDocumentById(this.pool, table, id)) as Record<string, unknown> | null;
  }

  file(name: string, value: unknown): string {
    const file = path.join(this.runDirectory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    return file;
  }

  /** Delete every scratch row plus the derived rows the commands wrote for them. */
  async cleanup(): Promise<void> {
    const derived: Array<[keyof typeof tableColumns, string, string[]]> = [];
    for (const [table, columns] of Object.entries(tableColumns) as Array<[keyof typeof tableColumns, Record<string, unknown>]>) {
      if ("slug" in columns && table !== "substanceIndex" && table !== "replications") derived.push([table, "slug", this.scratchSlugs]);
      if ("replication_slug" in columns) derived.push([table, "replication_slug", this.scratchSlugs]);
      if ("replication_id" in columns) derived.push([table, "replication_id", this.scratch.filter((row) => row.table === "replications").map((row) => row.id)]);
      if ("profile_id" in columns) derived.push([table, "profile_id", this.scratch.filter((row) => row.table === "contributorProfiles").map((row) => row.id)]);
      if ("key" in columns && table === "contentRevisions") derived.push([table, "key", this.scratchKeys]);
    }
    for (const [table, column, values] of derived) {
      if (values.length === 0) continue;
      const rows = await selectDocuments(this.pool, table, { where: `"${column}" = ANY($1)`, params: [values] });
      for (const row of rows) await deleteDocument(this.pool, table, row._id as string);
    }
    // Outbox rows are keyed `<table>:<slug or key>`.
    const keys = [...this.scratchSlugs, ...this.scratchKeys];
    if (keys.length) {
      const outbox = await selectDocuments(this.pool, "publicCachePublications", { where: `"key" ~ $1`, params: [`(${keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`] });
      for (const row of outbox) await deleteDocument(this.pool, "publicCachePublications", row._id as string);
    }
    for (const row of [...this.scratch].reverse()) await deleteDocument(this.pool, row.table, row.id);
  }
}

/**
 * `substanceArticleLightValidator` does not name `section_gaps`, so an article
 * carrying it cannot be written back through `saveSubstance` or
 * `citationEvidence.applyDraft` on either backend. Articles that round-trip
 * through the editor never carry it; the shared fixture does, so the seed
 * drops it (the same trim the article lifecycle and citation rehearsals make).
 */
function scratchArticle(overrides: Record<string, unknown>): Record<string, unknown> {
  const article = { ...structuredClone(minimalArticle), ...overrides } as Record<string, unknown>;
  delete article.section_gaps;
  return article;
}

// ---------------------------------------------------------------------------
// citations: scripts/citations/verdict-apply.mjs
// ---------------------------------------------------------------------------

async function citations(r: Rehearsal): Promise<void> {
  const family = "citations";
  const script = "scripts/citations/verdict-apply.mjs";
  const slug = `t17-citations-${mintDocumentId().slice(0, 8)}`;
  const keepClaim = "Rehearsal drug was first described in 1974.[cite:ref-a]";
  const stripClaim = "Rehearsal drug is twice as common as its analogue.[cite:ref-b]";
  const parkClaim = "Rehearsal drug appears in regional folklore.[cite:ref-c]";
  const summary = `${keepClaim} ${stripClaim} ${parkClaim}`;
  const article = scratchArticle({
    id: 917001,
    slug,
    title: `Rehearsal citations ${slug}`,
    summary,
    references: [
      { id: "ref-a", title: "Reference A", url: "https://example.org/a" },
      { id: "ref-b", title: "Reference B", url: "https://example.org/b" },
      { id: "ref-c", title: "Reference C", url: "https://example.org/c" },
    ],
  });
  const id = await r.insert("substanceIndex", article);
  const row = (markerId: string, claimText: string, verdict: string, disposition: string, quote: string) => {
    const start = summary.indexOf(claimText);
    return {
      pairId: buildPairId({ slug, section: "summary", markerId, claimText }),
      claimText,
      claimOffsets: [start, start + claimText.length],
      markerId,
      sourceUrl: "https://example.org/source",
      accessedAt: "2026-08-30T12:00:00.000Z",
      verdict,
      quote,
      quoteLocation: quote ? "Abstract" : "",
      rationale: "The quoted passage states the claim verbatim, including the year.",
      safetySensitive: false,
      proposedDisposition: disposition,
      ...(disposition === "strip" ? { suggestedRepair: "Rehearsal drug is more common than its analogue." } : {}),
    };
  };
  const draft = {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    campaign: "citation-pi",
    wave: "wave-1",
    slug,
    sections: [{
      section: "summary",
      contentHash: contentHash(summary),
      rows: [
        row("ref-a", keepClaim, "supported", "keep", "Rehearsal drug was first described in 1974."),
        row("ref-b", stripClaim, "partial", "strip", "Rehearsal drug is somewhat more common than its analogue."),
        row("ref-c", parkClaim, "unverifiable", "park", ""),
      ],
    }],
  };
  const draftFile = r.file(`citations/${slug}/verdict-draft.json`, draft);
  const base = [`--slug=${slug}`, `--draft-file=${draftFile}`];
  const ceremony = ["--write", "--confirm-citation-write", "--confirm-write=apply-citation-verdict-draft"];
  const before = await r.hash("substanceIndex", id);

  r.succeeded(family, "dry run plans keep/strip/park against the Postgres article", r.run(script, [...base, "--dry-run"]), /No writes performed/);
  expect(family, "dry run left the article untouched", (await r.hash("substanceIndex", id)) === before);
  r.refused(family, "wrong --expected-deployment is refused before writing", r.run(script, [...base, ...ceremony, `--expected-deployment=${WRONG_DEPLOYMENT}`]), /does not match target deployment localhost\/dosewiki|does not match target deployment/);
  r.refused(family, "missing --confirm-citation-write is refused", r.run(script, [...base, "--write", "--confirm-write=apply-citation-verdict-draft", `--expected-deployment=${r.fingerprint}`]), /requires --confirm-citation-write/);
  expect(family, "refusals wrote nothing", (await r.hash("substanceIndex", id)) === before);

  await patchDocument(r.pool, "substanceIndex", id, { summary: `${summary} Edited after review.` });
  r.refused(family, "stale live content (summary edited after the draft) is refused", r.run(script, [...base, ...ceremony, `--expected-deployment=${r.fingerprint}`]), /content.?hash|drift/i);
  await patchDocument(r.pool, "substanceIndex", id, { summary });
  expect(family, "stale refusal wrote nothing", (await r.hash("substanceIndex", id)) === before);

  const write = r.run(script, [...base, ...ceremony, `--expected-deployment=${r.fingerprint}`]);
  r.succeeded(family, "write applied through citationEvidence.applyDraft", write, /Applied .* on localhost\/dosewiki|Applied /);
  const after = await r.get("substanceIndex", id);
  expect(family, "strip replaced only the [cite:ref-b] token with [citation-needed]", after?.summary === summary.replace("[cite:ref-b]", "[citation-needed]"), after?.summary);
  const evidence = await selectDocuments(r.pool, "citationEvidence", { where: '"slug" = $1', params: [slug] });
  const statuses = evidence.map((doc) => `${doc.referenceId ?? doc.reference_id ?? "?"}:${doc.status}`).sort();
  expect(family, "evidence rows recorded supported and needs_source dispositions", evidence.length === 2 && evidence.some((doc) => doc.status === "supported") && evidence.some((doc) => doc.status === "needs_source"), statuses);
  const receiptPath = write.stdout.match(/receipt: (\S+)/)?.[1];
  const receipt = receiptPath && fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, "utf8")) : null;
  expect(family, "receipt names the slug, the Postgres fingerprint, and the kept/stripped pair ids", receipt?.slug === slug && receipt?.deployment === r.fingerprint && receipt?.kept?.length === 1 && receipt?.stripped?.length === 1 && receipt?.parked?.length === 1, receipt);
  const backupPath = write.stdout.match(/Backup: (\S+)/)?.[1];
  const auditPath = write.stdout.match(/audit: (\S+?);/)?.[1];
  expect(family, "backup snapshot and audit log were written", Boolean(backupPath && fs.existsSync(backupPath) && auditPath && fs.existsSync(auditPath)), { backupPath, auditPath });
  expect(family, "revalidation failure was downgraded to a recorded warning (no editor host contacted)", /Revalidation FAILED/.test(write.stdout) && receipt?.revalidation?.ok === false);

  r.refused(family, "replaying the applied draft is refused (content hash no longer matches)", r.run(script, [...base, ...ceremony, `--expected-deployment=${r.fingerprint}`]), /content.?hash|drift/i);
}

// ---------------------------------------------------------------------------
// legality: scripts/legality/apply-draft.mjs
// ---------------------------------------------------------------------------

async function legality(r: Rehearsal): Promise<void> {
  const family = "legality";
  const script = "scripts/legality/apply-draft.mjs";
  const slug = `t17-legality-${mintDocumentId().slice(0, 8)}`;
  const germanyBefore = { status: "Illegal", notes: "Listed as a controlled narcotic." };
  const article = scratchArticle({
    id: 917002,
    slug,
    title: `Rehearsal legality ${slug}`,
    legality: { international: [], countries: { Germany: germanyBefore }, usStates: {} },
  });
  const id = await r.insert("substanceIndex", article);
  const sources = [{ url: "https://example.org/narcotics-act", title: "Narcotics Act", supportQuote: "Listed in Schedule I of the Act." }];
  const draft = {
    slug,
    generatedAt: new Date().toISOString(),
    international: [],
    internationalSources: [],
    entries: {
      France: { canonicalStatus: "prohibited", instrument: "Public Health Code", status: "Illegal", notes: "Classified as a narcotic under the Public Health Code.", sources },
    },
    corrections: {
      Germany: {
        canonicalStatus: "prescription_only", instrument: "Narcotics Act", status: "Prescription only",
        notes: "Available on prescription under the Narcotics Act.", sources,
        oldEntry: germanyBefore, whatWasWrong: "The entry recorded a blanket prohibition; the statute permits prescription.",
      },
    },
    gaps: [],
    refuted: [],
  };
  // apply-draft resolves the draft under <repo>/runs/legality/<slug>/ by design.
  const runDir = path.join(ROOT, "runs", "legality", slug);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "legality-draft.json"), `${JSON.stringify(draft, null, 2)}\n`);
  const base = [`--slug=${slug}`];
  const ceremony = ["--write", "--confirm-legality-write", "--confirm-write=apply-legality-research-draft"];
  const before = await r.hash("substanceIndex", id);
  try {
    r.succeeded(family, "dry run plans the add and the correction", r.run(script, [...base, "--dry-run"]), /No writes performed/);
    expect(family, "dry run left the article untouched", (await r.hash("substanceIndex", id)) === before);
    r.refused(family, "wrong --expected-deployment is refused before writing", r.run(script, [...base, ...ceremony, `--expected-deployment=${WRONG_DEPLOYMENT}`]), /does not match target deployment/);
    r.refused(family, "missing --confirm-legality-write is refused", r.run(script, [...base, "--write", "--confirm-write=apply-legality-research-draft", `--expected-deployment=${r.fingerprint}`]), /requires --confirm-legality-write/);
    expect(family, "refusals wrote nothing", (await r.hash("substanceIndex", id)) === before);

    await patchDocument(r.pool, "substanceIndex", id, { legality: { international: [], countries: { Germany: { status: "Illegal", notes: "Rewritten after review." } }, usStates: {} } });
    r.refused(family, "stale correction (live Germany notes moved) is refused", r.run(script, [...base, ...ceremony, `--expected-deployment=${r.fingerprint}`]), /Stale draft for Germany/);
    await patchDocument(r.pool, "substanceIndex", id, { legality: article.legality });
    expect(family, "stale refusal wrote nothing", (await r.hash("substanceIndex", id)) === before);

    const write = r.run(script, [...base, ...ceremony, `--expected-deployment=${r.fingerprint}`]);
    r.succeeded(family, "write applied through substanceIndex.saveSubstance", write, /Applied .*1 add, 1 correct/);
    const after = await r.get("substanceIndex", id);
    const countries = (after?.legality as { countries?: Record<string, Record<string, unknown>> } | undefined)?.countries ?? {};
    expect(family, "France added and Germany corrected with canonical status and designation-free entry", countries.France?.canonicalStatus === "prohibited" && countries.Germany?.status === "Prescription only" && countries.Germany?.canonicalStatus === "prescription_only", countries);
    const applied = fs.existsSync(path.join(runDir, "applied.json")) ? JSON.parse(fs.readFileSync(path.join(runDir, "applied.json"), "utf8")) : null;
    expect(family, "applied.json receipt lists the added and corrected countries", applied?.slug === slug && applied?.added?.[0] === "France" && applied?.corrected?.[0] === "Germany", applied);
    const backupPath = write.stdout.match(/Backup: (\S+)/)?.[1];
    const auditPath = write.stdout.match(/audit: (\S+)/)?.[1];
    expect(family, "backup snapshot and audit log were written", Boolean(backupPath && fs.existsSync(backupPath) && auditPath && fs.existsSync(auditPath)), { backupPath, auditPath });
    const auditEntry = auditPath && fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, "utf8")) : null;
    expect(family, "the audit entry names the slug, completes, and points at the backup and the applied receipt", auditEntry?.slug === slug && auditEntry?.status === "completed" && auditEntry?.backupPath === backupPath && typeof auditEntry?.appliedPath === "string" && fs.existsSync(auditEntry.appliedPath), auditEntry && { slug: auditEntry.slug, status: auditEntry.status });
    // `substanceIndex.saveSubstance` patches the article row and nothing else
    // (server/lib/substanceIngestion.ts), so this family's reconciliation trail
    // is the local backup, audit entry, and applied.json, not a server journal.
    const revisions = await selectDocuments(r.pool, "articleRevisions", { where: '"slug" = $1', params: [slug] });
    expect(family, "saveSubstance wrote no server-side revision row (local artifacts are the trail)", revisions.length === 0, revisions.length);

    r.refused(family, "replaying the applied draft is refused (France already present)", r.run(script, [...base, ...ceremony, `--expected-deployment=${r.fingerprint}`]), /Cannot add France: the live article already has a country entry/);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// media: scripts/replications/apply-date-research.mjs and apply-artist-license.mjs
// ---------------------------------------------------------------------------

async function scratchReplication(r: Rehearsal, overrides: Record<string, unknown>): Promise<{ id: string; document: Record<string, unknown> }> {
  const [fixture] = await selectDocuments(r.pool, "replications", { where: '"role" IS NULL OR "role" = \'replication\'', limit: 1 });
  if (!fixture) throw new Error("No fixture replication row to clone");
  const { _id, _creationTime, ...body } = fixture;
  const document: Record<string, unknown> = {
    ...body,
    role: "replication",
    publication_state: "published",
    duplicate_of_replication_id: undefined,
    duplicate_evidence_digest: undefined,
    duplicate_operation_id: undefined,
    duplicate_suppressed_at: undefined,
    date_info: undefined,
    // `replications` carries three unique identities (slug, source_catalog_id,
    // taxonomy_record_key). The clone keeps the fixture's shape but must mint
    // its own, or migration 0003's unique indexes refuse the insert.
    source_catalog_id: `t18-catalog-${mintDocumentId().slice(0, 12)}`,
    taxonomy_record_key: `t18-taxonomy-${mintDocumentId().slice(0, 12)}`,
    ...overrides,
  };
  for (const key of Object.keys(document)) if (document[key] === undefined) delete document[key];
  const id = await r.insert("replications", document);
  return { id, document };
}

async function mediaDates(r: Rehearsal): Promise<void> {
  const family = "media-dates";
  const script = "scripts/replications/apply-date-research.mjs";
  const tag = mintDocumentId().slice(0, 8);
  const slug = `t18-dates-${tag}`;
  const title = `Rehearsal date research ${tag}`;
  const artist = `T18 Dates Artist ${tag}`;
  const { id } = await scratchReplication(r, { slug, title, artist });
  const now = new Date().toISOString();
  const input = {
    generatedAt: now,
    recordCount: 1,
    records: [{
      liveId: id,
      title,
      artist,
      raw: { slug },
      date: "2020-05-01",
      dateKind: "exact_date",
      eventType: "upload",
      confidence: "high",
      rationale: "The upload timestamp is printed on the source page.",
      sourceUrls: ["https://example.org/post"],
      dateBoundResearch: { retrievedAt: now, raw: { evidence: [{ url: "https://example.org/post", description: "Upload timestamp shown on the page." }] } },
    }],
  };
  const inputFile = r.file(`media-dates/${slug}/dose-wiki-item-dates-refined.json`, input);
  const ledgerFile = path.join(path.dirname(inputFile), "production-date-backfill-ledger.json");
  const base = [`--input=${inputFile}`, `--ledger=${ledgerFile}`];
  const before = await r.hash("replications", id);

  const dry = r.run(script, [...base, "--dry-run"]);
  r.succeeded(family, "dry run reconciles the scratch replication by immutable id", dry, /"matchedByStableId": 1/);
  expect(family, "dry run left the replication untouched", (await r.hash("replications", id)) === before);
  const digest = dry.stdout.match(/"payloadDigest": "([a-f0-9]{64})"/)?.[1] ?? "missing";
  expect(family, "dry run printed the payload digest the write must repeat", digest !== "missing");
  const ceremony = ["--write", "--confirm-write=replication-date-backfill", "--confirm-date-backfill", `--digest=${digest}`];
  r.refused(family, "wrong --expected-deployment is refused before writing", r.run(script, [...base, ...ceremony, `--expected-deployment=${WRONG_DEPLOYMENT}`]), /does not match target deployment/);
  r.refused(family, "missing --confirm-date-backfill is refused", r.run(script, [...base, "--write", "--confirm-write=replication-date-backfill", `--digest=${digest}`, `--expected-deployment=${r.fingerprint}`]), /Write requires --confirm-date-backfill/);
  r.refused(family, "a digest that does not match the payload is refused", r.run(script, [...base, "--write", "--confirm-write=replication-date-backfill", "--confirm-date-backfill", "--digest=deadbeef", `--expected-deployment=${r.fingerprint}`]), /Write requires --digest=/);
  expect(family, "refusals wrote nothing", (await r.hash("replications", id)) === before);

  await patchDocument(r.pool, "replications", id, { title: `${title} (renamed)` });
  r.refused(family, "stale identity (live title moved) is refused before writing", r.run(script, [...base, ...ceremony, `--expected-deployment=${r.fingerprint}`]), /reconciliation failed: 0 missing, 1 identity conflicts/);
  await patchDocument(r.pool, "replications", id, { title });
  expect(family, "stale refusal wrote nothing", (await r.hash("replications", id)) === before);

  const write = r.run(script, [...base, ...ceremony, `--expected-deployment=${r.fingerprint}`]);
  r.succeeded(family, "write applied through replicationDates.applyResearchBatch and verified by readback", write, /"verified": 1/);
  const after = await r.get("replications", id);
  const dateInfo = after?.date_info as { value?: string; kind?: string } | undefined;
  expect(family, "replication summary carries the researched date", dateInfo?.value === "2020-05-01" && dateInfo?.kind === "exact_date", dateInfo);
  const research = await selectDocuments(r.pool, "replicationDateResearch", { where: '"replication_id" = $1', params: [id] });
  expect(family, "one date-research row records the evidence and artifact digests", research.length === 1 && typeof research[0].source_artifact_sha256 === "string", research.length);
  const ledger = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, "utf8")) : null;
  expect(family, "ledger is complete and names the Postgres fingerprint, payload digest, and completed id", ledger?.status === "complete" && ledger?.targetDeployment === r.fingerprint && ledger?.payloadDigest === digest && ledger?.completedIds?.[0] === id && ledger?.verification?.verified === 1, ledger && { status: ledger.status, targetDeployment: ledger.targetDeployment });

  const replay = r.run(script, [...base, ...ceremony, `--expected-deployment=${r.fingerprint}`]);
  r.succeeded(family, "replaying with the completed ledger applies no batch and re-verifies", replay, /"verified": 1/);
  expect(family, "replay did not append a batch", JSON.parse(fs.readFileSync(ledgerFile, "utf8")).batches.length === 1);
  fs.writeFileSync(ledgerFile, JSON.stringify({ ...ledger, payloadDigest: "0".repeat(64) }, null, 2));
  r.refused(family, "a ledger from a different payload is refused", r.run(script, [...base, ...ceremony, `--expected-deployment=${r.fingerprint}`]), /Existing ledger belongs to a different payload or deployment/);
}

async function mediaRights(r: Rehearsal): Promise<void> {
  const family = "media-rights";
  const script = "scripts/replications/apply-artist-license.mjs";
  const tag = mintDocumentId().slice(0, 8);
  const artist = `T18 Rights Artist ${tag}`;
  const { id } = await scratchReplication(r, {
    slug: `t18-rights-${tag}`, title: `Rehearsal rights ${tag}`, artist,
    rights_status: "unknown", license_name: undefined, license_url: undefined, credit_line: undefined, rightsholder: undefined,
  });
  const base = [`--artist=${artist}`, "--license=cc-by-4.0"];
  const before = await r.hash("replications", id);

  r.succeeded(family, "dry run matches the scratch replication by artist", r.run(script, [...base, "--dry-run"]), /Matched 1 replications; 1 need updating/);
  expect(family, "dry run left the replication untouched", (await r.hash("replications", id)) === before);
  r.refused(family, "wrong --expected-deployment is refused before writing", r.run(script, [...base, "--write", "--confirm-write=apply-replication-license", `--expected-deployment=${WRONG_DEPLOYMENT}`]), /does not match target deployment/);
  r.refused(family, "missing --confirm-write is refused", r.run(script, [...base, "--write", `--expected-deployment=${r.fingerprint}`]), /requires --confirm-write=apply-replication-license/);
  expect(family, "refusals wrote nothing", (await r.hash("replications", id)) === before);

  r.succeeded(family, "write applied through replications.updateRightsMetadata", r.run(script, [...base, "--write", "--confirm-write=apply-replication-license", `--expected-deployment=${r.fingerprint}`]), /Updated 1 replications to CC BY 4\.0/);
  const after = await r.get("replications", id);
  expect(family, "rights metadata reads back as the explicit licence", after?.rights_status === "explicit-license" && after?.license_name === "CC BY 4.0" && after?.rightsholder === artist, { rights_status: after?.rights_status, license_name: after?.license_name });
  const receipts = await selectDocuments(r.pool, "replicationEditReceipts", { where: '"target" = $1', params: [`replication:${id}`] });
  expect(family, "the mutation journaled an edit receipt for the replication", receipts.length >= 1, receipts.length);
  r.succeeded(family, "replaying settles with nothing to update", r.run(script, [...base, "--write", "--confirm-write=apply-replication-license", `--expected-deployment=${r.fingerprint}`]), /Matched 1 replications; 0 need updating/);
  expect(family, "stale-content guard: not implemented by this command (last writer wins by design)", true);
}

// ---------------------------------------------------------------------------
// identity: scripts/contributors/apply-profile-patches.mjs
// ---------------------------------------------------------------------------

async function identity(r: Rehearsal): Promise<void> {
  const family = "identity";
  const script = "scripts/contributors/apply-profile-patches.mjs";
  const key = `T18-PROFILE-${mintDocumentId().slice(0, 6).toUpperCase()}`;
  const now = new Date().toISOString();
  const id = await r.insert("contributorProfiles", { key, displayName: "Before Rehearsal", aliases: [], bio: "", links: [], createdAt: now, updatedAt: now });
  const plan = { patches: [{ key, why: "Rehearsal", expected: { displayName: "Before Rehearsal", approved_replicator: false }, patch: { displayName: "After Rehearsal", aliases: ["rehearsal alias"], approved_replicator: true } }] };
  const planFile = r.file(`identity/${key}/plan.json`, plan);
  const base = [`--plan=${planFile}`];
  const before = await r.hash("contributorProfiles", id);

  r.succeeded(family, "dry run plans the update against the Postgres profile", r.run(script, [...base, "--dry-run"]), /1 planned: 1 to write, 0 settled, 0 blocked/);
  expect(family, "dry run left the profile untouched", (await r.hash("contributorProfiles", id)) === before);
  r.refused(family, "wrong --expected-deployment is refused before writing", r.run(script, [...base, "--write", "--confirm-write=apply-contributor-profile-patches", `--expected-deployment=${WRONG_DEPLOYMENT}`]), /does not match target deployment/);
  r.refused(family, "missing --confirm-write is refused", r.run(script, [...base, "--write", `--expected-deployment=${r.fingerprint}`]), /requires --confirm-write=apply-contributor-profile-patches/);
  expect(family, "refusals wrote nothing", (await r.hash("contributorProfiles", id)) === before);

  await patchDocument(r.pool, "contributorProfiles", id, { displayName: "Moved Since Review" });
  r.refused(family, "stale expected value (displayName moved) is refused", r.run(script, [...base, "--write", "--confirm-write=apply-contributor-profile-patches", `--expected-deployment=${r.fingerprint}`]), /drifted|Re-review the plan/);
  await patchDocument(r.pool, "contributorProfiles", id, { displayName: "Before Rehearsal" });
  expect(family, "stale refusal wrote nothing", (await r.hash("contributorProfiles", id)) === before);

  r.succeeded(family, "write applied through contributorProfiles.saveProfileAsEditor", r.run(script, [...base, "--write", "--confirm-write=apply-contributor-profile-patches", `--expected-deployment=${r.fingerprint}`]), /Updated 1 profile/);
  const after = await r.get("contributorProfiles", id);
  // An explicit alias list replaces the stored one, and the key plus the new
  // display name are always folded back in, lowercased (server/lib/contributorProfilePatches.ts).
  const aliases = Array.isArray(after?.aliases) ? (after.aliases as string[]) : [];
  expect(family, "profile reads back with the planned patch and the folded-in identity aliases", after?.displayName === "After Rehearsal" && after?.approved_replicator === true && aliases.length === 3 && ["rehearsal alias", key.toLowerCase(), "after rehearsal"].every((alias) => aliases.includes(alias)), { displayName: after?.displayName, approved_replicator: after?.approved_replicator, aliases });
  const revisions = await selectDocuments(r.pool, "contentRevisions", { where: '"table" = $1 AND "key" = $2', params: ["contributorProfiles", key] });
  expect(family, "content revision journal recorded the prior profile", revisions.length >= 1, revisions.length);
  // Receipt reuse: the plan's `expected` values describe the pre-write row, so
  // replaying it is blocked rather than silently re-applied.
  const applied = await r.hash("contributorProfiles", id);
  r.refused(family, "replaying the applied plan is refused (its expected values no longer match the live profile)", r.run(script, [...base, "--write", "--confirm-write=apply-contributor-profile-patches", `--expected-deployment=${r.fingerprint}`]), /1 planned: 0 to write, 0 settled, 1 blocked[\s\S]*Re-review the plan/);
  expect(family, "the blocked replay left the applied profile untouched", (await r.hash("contributorProfiles", id)) === applied);
}

// ---------------------------------------------------------------------------
// merge: the approved-pair gate
// ---------------------------------------------------------------------------

async function merge(r: Rehearsal, client: ReturnType<typeof createDataClient>["client"]): Promise<void> {
  const family = "merge";
  const [admin] = await selectDocuments(r.pool, "memberships", { where: `"role" = 'admin' AND "bannedAt" IS NULL`, limit: 1 });
  const now = new Date().toISOString();
  const sourceId = await r.insert("contributorProfiles", { key: `T18-MERGE-SRC-${mintDocumentId().slice(0, 6).toUpperCase()}`, displayName: "Merge Source", aliases: [], bio: "", links: [], createdAt: now, updatedAt: now });
  const targetId = await r.insert("contributorProfiles", { key: `T18-MERGE-DST-${mintDocumentId().slice(0, 6).toUpperCase()}`, displayName: "Merge Target", aliases: [], bio: "", links: [], createdAt: now, updatedAt: now });
  const [source, target] = await Promise.all([r.get("contributorProfiles", sourceId), r.get("contributorProfiles", targetId)]);
  let refusal: string | null = null;
  try {
    await client.query(api.contributorProfileMerges.preview, {
      apiKey: token("replicationMaintenance"),
      actor_email: String(admin?.email ?? "missing-admin@example.invalid"),
      input: {
        source_profile_id: sourceId as never, source_key: String(source?.key), target_profile_id: targetId as never, target_key: String(target?.key),
        pinned_snapshot_digest: "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d", pinned_snapshot_profile_count: 2119,
        expected_state_digest: "0".repeat(64), applied_at: Date.now(),
      },
    });
  } catch (error) {
    refusal = error instanceof Error ? error.message : String(error);
  }
  expect(family, "contributorProfileMerges.preview refuses a pair outside the two owner-approved immutable ids on the runtime", refusal !== null && /owner-approved/.test(refusal), refusal);
  expect(family, "merge apply on scratch profiles: not rehearsable (mutation is pinned to production ids by design)", true);
}

async function main() {
  const argv = process.argv.slice(2);
  const keep = argv.includes("--keep");
  const created = createDataClient({ env: { ...process.env, DATA_BACKEND: "postgres" }, argv });
  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-commands`);
  const r = new Rehearsal(created.target, runDirectory);
  const started = performance.now();
  expect("setup", `factory selected Postgres (${r.fingerprint})`, created.backend === "postgres");
  try {
    for (const [name, family] of [["citations", citations], ["legality", legality], ["media-dates", mediaDates], ["media-rights", mediaRights], ["identity", identity]] as const) {
      try {
        await family(r);
      } catch (error) {
        expect(name, "family completed without an unexpected error", false, error instanceof Error ? error.stack ?? error.message : error);
      }
    }
    try {
      await merge(r, created.client);
    } catch (error) {
      expect("merge", "family completed without an unexpected error", false, error instanceof Error ? error.stack ?? error.message : error);
    }
  } finally {
    if (!keep) {
      try {
        await r.cleanup();
      } catch (error) {
        expect("cleanup", "scratch rows deleted", false, error instanceof Error ? error.message : error);
      }
    }
    const passed = checks.filter((check) => check.pass).length;
    const families = Object.fromEntries([...new Set(checks.map((check) => check.family))].map((family) => [family, {
      passed: checks.filter((check) => check.family === family && check.pass).length,
      failed: checks.filter((check) => check.family === family && !check.pass).length,
    }]));
    const summary = {
      target: created.target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      fingerprint: r.fingerprint,
      kept: keep,
      elapsedMs: Math.round(performance.now() - started),
      passed,
      failed: checks.length - passed,
      families,
      checks,
    };
    fs.mkdirSync(runDirectory, { recursive: true });
    fs.writeFileSync(path.join(runDirectory, "report.json"), JSON.stringify(summary, null, 2));
    console.log(`\nReport: ${path.relative(ROOT, runDirectory)}/report.json`);
    console.log(JSON.stringify(families));
    console.log(JSON.stringify({ passed, failed: summary.failed, elapsedMs: summary.elapsedMs }));
    process.exitCode = summary.failed === 0 ? 0 : 1;
    await created.client.end?.();
    await r.pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
