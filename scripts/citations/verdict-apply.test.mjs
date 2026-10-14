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
  stripVerdictTokens,
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
