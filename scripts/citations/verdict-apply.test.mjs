import test from "node:test";
import assert from "node:assert/strict";

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import {
  CITATION_NEEDED_TOKEN,
  ContentHashDriftError,
  DRAFT_SCHEMA_VERSION,
  buildPairId,
  contentHash,
} from "./verdict-lib.mjs";
import {
  assertTokenOnlyDelta,
  buildVerdictApplyPlan,
  recordPostWriteVisibility,
  requestArticleRevalidation,
  stripVerdictTokens,
  verifyPublicArticle,
} from "./verdict-apply.mjs";

const CLI = resolve(fileURLToPath(import.meta.url), "..", "verdict-apply.mjs");
const SLUG = "testdrug";

const KEEP_CLAIM = "Testdrug was first described in 1974.[cite:ref-a]";
const STRIP_CLAIM = "Testdrug is twice as common as its analogue.[cite:ref-b]";
const PARK_CLAIM = "Testdrug appears in regional folklore.[cite:ref-c]";
const SUMMARY = `${KEEP_CLAIM} ${STRIP_CLAIM} ${PARK_CLAIM}`;
const MECHANISM = "Testdrug binds nothing in particular.[cite:ref-b] It remains inert.";

function makeArticle() {
  return {
    id: 1,
    slug: SLUG,
    title: "Testdrug",
    summary: SUMMARY,
    pharmacology: { mechanism: MECHANISM, pharmacokinetics: "Unknown." },
    references: [
      { id: "ref-a", title: "Reference A", url: "https://example.org/a" },
      { id: "ref-b", title: "Reference B", url: "https://example.org/b" },
      { id: "ref-c", title: "Reference C", url: "https://example.org/c" },
    ],
  };
}

function makeRow({
  section = "summary",
  field = SUMMARY,
  markerId,
  claimText,
  verdict,
  disposition,
  quote = "",
  quoteLocation = "",
  suggestedRepair,
  refuter,
  safetySensitive = false,
}) {
  const start = field.indexOf(claimText);
  assert.notEqual(start, -1, `fixture claim must exist in fixture field: ${claimText}`);
  return {
    pairId: buildPairId({ slug: SLUG, section, markerId, claimText }),
    claimText,
    claimOffsets: [start, start + claimText.length],
    markerId,
    sourceUrl: "https://example.org/source",
    accessedAt: "2026-08-30T12:00:00.000Z",
    verdict,
    quote,
    quoteLocation,
    rationale: "The quoted passage states the claim verbatim, including the year.",
    safetySensitive,
    proposedDisposition: disposition,
    ...(suggestedRepair !== undefined ? { suggestedRepair } : {}),
    ...(refuter !== undefined ? { refuter } : {}),
  };
}

function makeDraft(article = makeArticle()) {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    campaign: "citation-pi",
    wave: "wave-1",
    slug: SLUG,
    sections: [
      {
        section: "summary",
        contentHash: contentHash(article.summary),
        rows: [
          makeRow({
            markerId: "ref-a",
            claimText: KEEP_CLAIM,
            verdict: "supported",
            disposition: "keep",
            quote: "Testdrug was first described in 1974.",
            quoteLocation: "Abstract",
          }),
          makeRow({
            markerId: "ref-b",
            claimText: STRIP_CLAIM,
            verdict: "partial",
            disposition: "strip",
            quote: "Testdrug is somewhat more common than its analogue.",
            quoteLocation: "Section 2",
            suggestedRepair: "Testdrug is more common than its analogue.",
          }),
          makeRow({
            markerId: "ref-c",
            claimText: PARK_CLAIM,
            verdict: "unverifiable",
            disposition: "park",
          }),
        ],
      },
    ],
  };
}

test("plan applies the exact single-token replacement and nothing else", () => {
  const article = makeArticle();
  const plan = buildVerdictApplyPlan({ article, draft: makeDraft(article) });

  assert.deepEqual(plan.totals, { keep: 1, strip: 1, park: 1, evidenceRows: 2, patchedSections: 1 });
  assert.equal(
    plan.sectionPatches.summary,
    SUMMARY.replace("[cite:ref-b]", CITATION_NEEDED_TOKEN),
  );
  // The keep and park markers survive untouched.
  assert.ok(plan.sectionPatches.summary.includes("[cite:ref-a]"));
  assert.ok(plan.sectionPatches.summary.includes("[cite:ref-c]"));
  assert.equal(stripVerdictTokens(plan.sectionPatches.summary), stripVerdictTokens(SUMMARY));

  const [keepOp, stripOp, parkOp] = plan.operations;
  assert.equal(keepOp.kind, "keep");
  assert.equal(stripOp.kind, "strip");
  assert.equal(stripOp.token, "[cite:ref-b]");
  assert.equal(parkOp.kind, "park");
});

test("strip replaces every repeated occurrence of one marker inside its claim", () => {
  const claim = "One source supports both clauses[cite:ref-b], including this one.[cite:ref-b]";
  const article = { ...makeArticle(), summary: claim };
  const draft = {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    campaign: "citation-pi",
    wave: "wave-1",
    slug: SLUG,
    sections: [{
      section: "summary",
      contentHash: contentHash(claim),
      rows: [makeRow({
        field: claim,
        markerId: "ref-b",
        claimText: claim,
        verdict: "partial",
        disposition: "strip",
        quote: "One source supports one clause.",
        quoteLocation: "Section 2",
      })],
    }],
  };

  const plan = buildVerdictApplyPlan({ article, draft });

  assert.equal(
    plan.sectionPatches.summary,
    claim.replaceAll("[cite:ref-b]", CITATION_NEEDED_TOKEN),
  );
  assert.deepEqual(
    plan.operations[0].tokenIndexes,
    [claim.indexOf("[cite:ref-b]"), claim.lastIndexOf("[cite:ref-b]")],
  );
  assert.equal(plan.evidence.length, 1);
});

test("keep produces a supported evidence row carrying quote and rationale", () => {
  const article = makeArticle();
  const plan = buildVerdictApplyPlan({ article, draft: makeDraft(article) });
  const keep = plan.evidence.find((row) => row.status === "supported");

  assert.equal(keep.claimKey, plan.operations[0].pairId);
  assert.equal(keep.section, "summary");
  assert.equal(keep.fieldPath, "summary");
  assert.equal(keep.entailmentVerdict, "entails");
  assert.deepEqual(keep.referenceIds, ["ref-a"]);
  assert.equal(keep.supports.length, 1);
  assert.equal(keep.supports[0].referenceId, "ref-a");
  assert.equal(keep.supports[0].sourceName, "Reference A");
  assert.equal(keep.supports[0].supportingQuote, "Testdrug was first described in 1974.");
  assert.equal(keep.supports[0].verifiedQuote.sourceId, keep.supports[0].sourceId);
  assert.equal(keep.severity, "non_blocking");
  assert.equal(keep.strictReviewEvidence, undefined);
});

test("strip produces a needs_source evidence row with the full verdict record", () => {
  const article = makeArticle();
  const plan = buildVerdictApplyPlan({ article, draft: makeDraft(article) });
  const strip = plan.evidence.find((row) => row.status === "needs_source");

  assert.equal(
    strip.statusReason,
    "verdict:partial; The quoted passage states the claim verbatim, including the year.; "
      + "suggestedRepair: Testdrug is more common than its analogue.",
  );
  assert.deepEqual(strip.referenceIds, []);
  assert.deepEqual(strip.supports, []);
  assert.equal(strip.provenance.verdict, "partial");
  assert.equal(strip.provenance.disposition, "strip");
});

test("park is a no-op: no evidence row, no text change", () => {
  const article = makeArticle();
  const plan = buildVerdictApplyPlan({ article, draft: makeDraft(article) });
  assert.equal(plan.evidence.length, 2);
  assert.ok(plan.sectionPatches.summary.includes("[cite:ref-c]"));
});

test("strips inside nested fields patch only that string", () => {
  const article = makeArticle();
  const claim = "Testdrug binds nothing in particular.[cite:ref-b]";
  const draft = {
    ...makeDraft(article),
    sections: [{
      section: "pharmacology",
      contentHash: contentHash(article.pharmacology),
      rows: [makeRow({
        section: "pharmacology",
        field: MECHANISM,
        markerId: "ref-b",
        claimText: claim,
        verdict: "mismatched",
        disposition: "strip",
        quote: "This source discusses a different compound.",
        quoteLocation: "Introduction",
      })],
    }],
  };
  const plan = buildVerdictApplyPlan({ article, draft });
  assert.equal(
    plan.sectionPatches.pharmacology.mechanism,
    MECHANISM.replace("[cite:ref-b]", CITATION_NEEDED_TOKEN),
  );
  assert.equal(plan.sectionPatches.pharmacology.pharmacokinetics, "Unknown.");
  // The original article is never mutated.
  assert.equal(article.pharmacology.mechanism, MECHANISM);
});

test("refuses when the live content hash drifts from the draft", () => {
  const article = makeArticle();
  const draft = makeDraft(article);
  draft.sections[0].contentHash = "0".repeat(64);
  assert.throws(
    () => buildVerdictApplyPlan({ article, draft }),
    (error) => error instanceof ContentHashDriftError && /content_hash_drift/.test(error.message),
  );
});

test("refuses when the marker id is absent from the live field", () => {
  const article = makeArticle();
  const draft = makeDraft(article);
  const row = draft.sections[0].rows[1];
  row.markerId = "ref-zz";
  row.pairId = buildPairId({ slug: SLUG, section: "summary", markerId: "ref-zz", claimText: row.claimText });
  assert.throws(() => buildVerdictApplyPlan({ article, draft }), /marker_not_found/);
});

test("refuses when the claim no longer exists in the live section", () => {
  const article = makeArticle();
  const draft = makeDraft(article);
  article.summary = article.summary.replace("1974", "1975");
  draft.sections[0].contentHash = contentHash(article.summary);
  assert.throws(() => buildVerdictApplyPlan({ article, draft }), /claim_not_found/);
});

test("refuses any delta beyond the single token replacement", () => {
  assert.doesNotThrow(() => assertTokenOnlyDelta({
    fieldPath: "summary",
    before: "A claim.[cite:x] More.",
    after: `A claim.${CITATION_NEEDED_TOKEN} More.`,
  }));
  assert.throws(() => assertTokenOnlyDelta({
    fieldPath: "summary",
    before: "A claim.[cite:x] More.",
    after: `A better claim.${CITATION_NEEDED_TOKEN} More.`,
  }), /text_delta_beyond_token/);
  assert.throws(() => assertTokenOnlyDelta({
    fieldPath: "summary",
    before: "A claim.[cite:x] More.",
    after: `A claim.${CITATION_NEEDED_TOKEN}`,
  }), /text_delta_beyond_token/);
});

test("safety-sensitive keeps require a confirming refuter record", () => {
  const article = makeArticle();
  const claim = "Overdose of testdrug may cause death.[cite:ref-a]";
  article.harm_potential = claim;
  const makeSafetyDraft = (refuter) => ({
    ...makeDraft(article),
    sections: [{
      section: "harm_potential",
      contentHash: contentHash(article.harm_potential),
      rows: [makeRow({
        section: "harm_potential",
        field: claim,
        markerId: "ref-a",
        claimText: claim,
        verdict: "supported",
        disposition: "keep",
        quote: "Overdose can be fatal.",
        quoteLocation: "Toxicity",
        safetySensitive: true,
        refuter,
      })],
    }],
  });

  assert.throws(
    () => buildVerdictApplyPlan({ article, draft: makeSafetyDraft(undefined) }),
    /missing_refuter_confirmation/,
  );

  const plan = buildVerdictApplyPlan({
    article,
    draft: makeSafetyDraft({ outcome: "confirmed", reason: "Refuter re-fetched the source; quote checks out." }),
  });
  const [keep] = plan.evidence;
  assert.equal(keep.severity, "blocking");
  assert.equal(keep.strictReviewEvidence.decision, "approved");
  assert.equal(keep.strictReviewEvidence.claimKey, keep.claimKey);
  assert.deepEqual(keep.strictReviewEvidence.referenceIds, ["ref-a"]);
});

function cliEnv() {
  // Strip database selectors so fixture runs cannot inherit a live target.
  const env = { ...process.env, DATA_BACKEND: "postgres" };
  for (const key of Object.keys(env)) {
    if (/POSTGRES/i.test(key)) delete env[key];
  }
  return env;
}

test("CLI dry-run against fixtures prints exactly the draft's operations", () => {
  const dir = mkdtempSync(join(tmpdir(), "verdict-apply-"));
  const article = makeArticle();
  const articlePath = join(dir, "article.json");
  const draftPath = join(dir, "verdict-draft.json");
  writeFileSync(articlePath, JSON.stringify(article, null, 2));
  writeFileSync(draftPath, JSON.stringify(makeDraft(article), null, 2));

  const result = spawnSync(process.execPath, [
    CLI,
    `--slug=${SLUG}`,
    `--draft-file=${draftPath}`,
    `--article-file=${articlePath}`,
    "--dry-run",
  ], { encoding: "utf8", env: cliEnv() });

  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  const opLines = lines.filter((line) => /^(KEEP|STRIP|PARK) /.test(line));
  assert.equal(opLines.length, 3);
  assert.match(opLines[0], /^KEEP testdrug:summary:ref-a:[0-9a-f]{12} ref=ref-a field=summary evidence=supported$/);
  assert.match(opLines[1], /^STRIP testdrug:summary:ref-b:[0-9a-f]{12} field=summary @\d+ \[cite:ref-b\] -> \[citation-needed\] evidence=needs_source verdict=partial$/);
  assert.match(opLines[2], /^PARK testdrug:summary:ref-c:[0-9a-f]{12} field=summary verdict=unverifiable$/);
  assert.match(result.stdout, /TOTALS: 1 keep, 1 strip, 1 park; 2 evidence rows; 1 patched section\(s\)/);
  assert.match(result.stdout, /No writes performed\./);
});

test("CLI refuses invalid drafts before planning", () => {
  const dir = mkdtempSync(join(tmpdir(), "verdict-apply-"));
  const article = makeArticle();
  const draft = makeDraft(article);
  draft.sections[0].rows[0].proposedDisposition = "strip"; // supported+strip is illegal
  const articlePath = join(dir, "article.json");
  const draftPath = join(dir, "verdict-draft.json");
  writeFileSync(articlePath, JSON.stringify(article, null, 2));
  writeFileSync(draftPath, JSON.stringify(draft, null, 2));

  const result = spawnSync(process.execPath, [
    CLI,
    `--slug=${SLUG}`,
    `--draft-file=${draftPath}`,
    `--article-file=${articlePath}`,
    "--dry-run",
  ], { encoding: "utf8", env: cliEnv() });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /illegal_disposition_for_verdict/);
});

test("CLI refuses legality drafts: legality is owned by legality-pi", () => {
  const dir = mkdtempSync(join(tmpdir(), "verdict-apply-"));
  const article = makeArticle();
  const draft = makeDraft(article);
  draft.sections[0].section = "legality";
  const articlePath = join(dir, "article.json");
  const draftPath = join(dir, "verdict-draft.json");
  writeFileSync(articlePath, JSON.stringify(article, null, 2));
  writeFileSync(draftPath, JSON.stringify(draft, null, 2));

  const result = spawnSync(process.execPath, [
    CLI,
    `--slug=${SLUG}`,
    `--draft-file=${draftPath}`,
    `--article-file=${articlePath}`,
    "--dry-run",
  ], { encoding: "utf8", env: cliEnv() });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /legality_section_excluded/);
});

test("CLI write path can never run against fixtures and demands the guard stack", () => {

  const dir = mkdtempSync(join(tmpdir(), "verdict-apply-"));
  const article = makeArticle();
  const articlePath = join(dir, "article.json");
  const draftPath = join(dir, "verdict-draft.json");
  writeFileSync(articlePath, JSON.stringify(article, null, 2));
  writeFileSync(draftPath, JSON.stringify(makeDraft(article), null, 2));

  // --write + --article-file is rejected outright.
  const fixtureWrite = spawnSync(process.execPath, [
    CLI,
    `--slug=${SLUG}`,
    `--draft-file=${draftPath}`,
    `--article-file=${articlePath}`,
    "--write",
  ], { encoding: "utf8", env: cliEnv() });
  assert.equal(fixtureWrite.status, 1);
  assert.match(fixtureWrite.stderr, /never valid with --write/);

  // --write without a target URL fails before any network or mutation.
  const bareWrite = spawnSync(process.execPath, [
    CLI,
    `--slug=${SLUG}`,
    `--draft-file=${draftPath}`,
    "--write",
    "--confirm-citation-write",
  ], { encoding: "utf8", env: cliEnv() });
  assert.equal(bareWrite.status, 1);
});

// ---------------------------------------------------------------------------
// Post-write visibility: revalidation hook + optional public verification.
// The Postgres write is already durable when these run, so every failure below
// must come back as a recorded warning, never a throw.
// ---------------------------------------------------------------------------

function jsonResponse(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload, text: async () => JSON.stringify(payload) };
}

function htmlResponse(html) {
  return { ok: true, status: 200, json: async () => { throw new Error("not json"); }, text: async () => html };
}

const STRIP_PLAN = {
  operations: [
    { kind: "keep", pairId: "p-keep", markerId: "ref-a" },
    { kind: "strip", pairId: "p-strip", markerId: "ref-b" },
  ],
};

test("requestArticleRevalidation posts the slug with the bearer token and returns the paths", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(200, { ok: true, revalidated: ["/testdrug"] });
  };

  const result = await requestArticleRevalidation({
    slug: SLUG,
    revalidateBaseUrl: "https://dev.dose.wiki/",
    token: "write-token",
    fetchImpl,
  });

  assert.deepEqual(result, {
    ok: true,
    url: "https://dev.dose.wiki/api/dev/revalidate-article",
    paths: ["/testdrug"],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer write-token");
  assert.deepEqual(JSON.parse(calls[0].init.body), { slug: SLUG });
});

test("requestArticleRevalidation names an HTTP rejection and never throws", async () => {
  const result = await requestArticleRevalidation({
    slug: SLUG,
    revalidateBaseUrl: "https://dev.dose.wiki",
    token: "wrong",
    fetchImpl: async () => jsonResponse(401, { error: "Invalid admin token." }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /^revalidation_http_401: Invalid admin token\./);
});

test("requestArticleRevalidation names an unreachable host and never throws", async () => {
  const result = await requestArticleRevalidation({
    slug: SLUG,
    revalidateBaseUrl: "https://dev.dose.wiki",
    token: "t",
    fetchImpl: async () => { throw new Error("getaddrinfo ENOTFOUND"); },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /^revalidation_unreachable: getaddrinfo ENOTFOUND/);
});

test("recordPostWriteVisibility records a successful revalidation without warnings", async () => {
  const warnings = [];
  const visibility = await recordPostWriteVisibility({
    slug: SLUG,
    plan: STRIP_PLAN,
    articleForWrite: { summary: "No markers left." },
    token: "t",
    revalidateBaseUrl: "https://dev.dose.wiki",
    fetchImpl: async () => jsonResponse(200, { ok: true, revalidated: ["/testdrug"] }),
    warn: (message) => warnings.push(message),
  });

  assert.deepEqual(visibility.revalidation, {
    ok: true,
    url: "https://dev.dose.wiki/api/dev/revalidate-article",
    paths: ["/testdrug"],
  });
  assert.equal(visibility.publicVerification, undefined);
  assert.deepEqual(warnings, []);
});

test("recordPostWriteVisibility downgrades a revalidation failure to a recorded warning", async () => {
  const warnings = [];
  const visibility = await recordPostWriteVisibility({
    slug: SLUG,
    plan: STRIP_PLAN,
    articleForWrite: {},
    token: "t",
    revalidateBaseUrl: "https://dev.dose.wiki",
    fetchImpl: async () => jsonResponse(502, { error: "upstream down" }),
    warn: (message) => warnings.push(message),
  });

  // The write already landed: the failure is a receipt field and a warning,
  // and the function returns instead of throwing.
  assert.equal(visibility.revalidation.ok, false);
  assert.match(visibility.revalidation.error, /^revalidation_http_502/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /WARNING: revalidation failed for testdrug/);
  assert.match(warnings[0], /write is valid/);
});

test("recordPostWriteVisibility skips public verification when no public URL is given", async () => {
  const calls = [];
  await recordPostWriteVisibility({
    slug: SLUG,
    plan: STRIP_PLAN,
    articleForWrite: {},
    token: "t",
    revalidateBaseUrl: "https://dev.dose.wiki",
    fetchImpl: async (url) => { calls.push(url); return jsonResponse(200, { ok: true, revalidated: ["/testdrug"] }); },
    warn: () => {},
  });

  assert.deepEqual(calls, ["https://dev.dose.wiki/api/dev/revalidate-article"]);
});

test("public verification confirms a fully-stripped reference is gone from the live HTML", async () => {
  const warnings = [];
  const visibility = await recordPostWriteVisibility({
    slug: SLUG,
    plan: STRIP_PLAN,
    articleForWrite: { summary: `Kept claim.[cite:ref-a] Gap claim.${CITATION_NEEDED_TOKEN}` },
    token: "t",
    revalidateBaseUrl: "https://dev.dose.wiki",
    verifyPublicBaseUrl: "https://dose.wiki",
    fetchImpl: async (url) => (url.endsWith("/api/dev/revalidate-article")
      ? jsonResponse(200, { ok: true, revalidated: ["/testdrug"] })
      : htmlResponse('<sup><a href="#ref-ref-a" data-reference-id="ref-a">1</a></sup> citation needed')),
    warn: (message) => warnings.push(message),
  });

  assert.deepEqual(visibility.publicVerification, {
    ok: true,
    url: "https://dose.wiki/testdrug",
    markers: [{ pairId: "p-strip", referenceId: "ref-b", status: "verified" }],
  });
  assert.deepEqual(warnings, []);
});

test("public verification flags a stripped reference that still renders, as a warning", async () => {
  const warnings = [];
  const visibility = await recordPostWriteVisibility({
    slug: SLUG,
    plan: STRIP_PLAN,
    articleForWrite: {},
    token: "t",
    revalidateBaseUrl: "https://dev.dose.wiki",
    verifyPublicBaseUrl: "https://dose.wiki",
    fetchImpl: async (url) => (url.endsWith("/api/dev/revalidate-article")
      ? jsonResponse(200, { ok: true, revalidated: ["/testdrug"] })
      : htmlResponse('stale page <a href="#ref-ref-b" data-reference-id="ref-b">2</a>')),
    warn: (message) => warnings.push(message),
  });

  assert.equal(visibility.publicVerification.ok, false);
  assert.deepEqual(visibility.publicVerification.markers, [
    { pairId: "p-strip", referenceId: "ref-b", status: "still_visible" },
  ]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /WARNING: public verification failed for testdrug \(p-strip\)/);
});

test("public verification cannot assert absence for a reference still cited elsewhere", async () => {
  const visibility = await recordPostWriteVisibility({
    slug: SLUG,
    plan: STRIP_PLAN,
    // Another field still carries [cite:ref-b], so its superscript legitimately
    // remains on the page.
    articleForWrite: { mechanism: "Still cited.[cite:ref-b]" },
    token: "t",
    revalidateBaseUrl: "https://dev.dose.wiki",
    verifyPublicBaseUrl: "https://dose.wiki",
    fetchImpl: async (url) => (url.endsWith("/api/dev/revalidate-article")
      ? jsonResponse(200, { ok: true, revalidated: ["/testdrug"] })
      : htmlResponse('<a href="#ref-ref-b" data-reference-id="ref-b">1</a>')),
    warn: () => { throw new Error("no warning expected"); },
  });

  assert.deepEqual(visibility.publicVerification.markers, [
    { pairId: "p-strip", referenceId: "ref-b", status: "skipped_still_cited" },
  ]);
  assert.equal(visibility.publicVerification.ok, true);
});

test("public verification skips the fetch entirely when nothing was stripped", async () => {
  const calls = [];
  const result = await verifyPublicArticle({
    slug: SLUG,
    publicBaseUrl: "https://dose.wiki",
    checks: [],
    fetchImpl: async (url) => { calls.push(url); return htmlResponse(""); },
  });

  assert.deepEqual(result, { ok: true, url: "https://dose.wiki/testdrug", markers: [] });
  assert.deepEqual(calls, []);
});

test("public verification records an unreachable public host as a named failure", async () => {
  const result = await verifyPublicArticle({
    slug: SLUG,
    publicBaseUrl: "https://dose.wiki",
    checks: [{ pairId: "p-strip", referenceId: "ref-b", stillCitedElsewhere: false }],
    fetchImpl: async () => { throw new Error("socket hang up"); },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /^public_fetch_unreachable: socket hang up/);
});
