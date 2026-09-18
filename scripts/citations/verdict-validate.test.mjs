import test from "node:test";
import assert from "node:assert/strict";

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { buildPairId, contentHash } from "./verdict-lib.mjs";
import {
  VALIDATABLE_SECTIONS,
  VALIDATION_ERROR_CODES,
  VERDICT_DRAFT_SCHEMA_VERSION,
  validateVerdictDraft,
} from "./verdict-validate.mjs";

const CLI = resolve(fileURLToPath(import.meta.url), "..", "verdict-validate.mjs");
const SLUG = "testdrug";

function makeRow({
  section = "summary",
  markerId,
  claimText,
  verdict,
  disposition,
  quote = "",
  quoteLocation = "",
  suggestedRepair,
  refuter,
}) {
  return {
    pairId: buildPairId({ slug: SLUG, section, markerId, claimText }),
    claimText,
    claimOffsets: [10, 10 + claimText.length],
    markerId,
    sourceUrl: "https://example.org/source",
    accessedAt: "2026-08-30T12:00:00.000Z",
    verdict,
    quote,
    quoteLocation,
    rationale: "The quoted passage states the claim verbatim, including the year.",
    safetySensitive: false,
    proposedDisposition: disposition,
    ...(suggestedRepair !== undefined ? { suggestedRepair } : {}),
    ...(refuter !== undefined ? { refuter } : {}),
  };
}

function makeCleanDraft() {
  return {
    schemaVersion: VERDICT_DRAFT_SCHEMA_VERSION,
    campaign: "citation-pi",
    wave: "wave-1",
    slug: SLUG,
    sections: [
      {
        section: "summary",
        contentHash: contentHash("Some summary text.[cite:ref-a]"),
        rows: [
          makeRow({
            markerId: "ref-a",
            claimText: "Testdrug was first described in 1974.[cite:ref-a]",
            verdict: "supported",
            disposition: "keep",
            quote: "Testdrug was first described in 1974.",
            quoteLocation: "Abstract",
          }),
          makeRow({
            markerId: "ref-b",
            claimText: "Testdrug is twice as common as its analogue.[cite:ref-b]",
            verdict: "partial",
            disposition: "strip",
            quote: "Testdrug is somewhat more common than its analogue.",
            quoteLocation: "Section 2",
            suggestedRepair: "Testdrug is more common than its analogue.",
          }),
          makeRow({
            markerId: "ref-c",
            claimText: "Testdrug appears in regional folklore.[cite:ref-c]",
            verdict: "unverifiable",
            disposition: "park",
          }),
        ],
      },
    ],
  };
}

function codesOf(draft) {
  return validateVerdictDraft(draft).errors.map((error) => error.code);
}

test("clean verdict draft passes with zero errors", () => {
  assert.deepEqual(codesOf(makeCleanDraft()), []);
});

// One mutation per named error code; each mutated draft must be rejected with
// exactly that named code among its errors.
const VIOLATIONS = [
  ["invalid_schema_version", (draft) => { draft.schemaVersion = "dosewiki_citation_verdict_draft_v99"; }],
  ["missing_campaign", (draft) => { draft.campaign = ""; }],
  ["missing_wave", (draft) => { delete draft.wave; }],
  ["missing_slug", (draft) => { delete draft.slug; }],
  ["invalid_sections", (draft) => { draft.sections = []; }],
  ["invalid_section", (draft) => { draft.sections[0].section = "dosage"; }],
  ["legality_section_excluded", (draft) => { draft.sections[0].section = "legality"; }],
  ["duplicate_section", (draft) => {
    draft.sections.push({ ...structuredClone(draft.sections[0]), rows: [draft.sections[0].rows[0]] });
  }],
  ["invalid_content_hash", (draft) => { draft.sections[0].contentHash = "not-a-hash"; }],
  ["invalid_rows", (draft) => { draft.sections[0].rows = []; }],
  ["invalid_pair_id", (draft) => { draft.sections[0].rows[0].pairId = "nonsense"; }],
  ["pair_id_mismatch", (draft) => {
    draft.sections[0].rows[0].pairId = buildPairId({
      slug: SLUG,
      section: "summary",
      markerId: "ref-a",
      claimText: "A different sentence entirely.",
    });
  }],
  ["duplicate_pair_id", (draft) => {
    draft.sections[0].rows.push(structuredClone(draft.sections[0].rows[0]));
  }],
  ["missing_claim_text", (draft) => { draft.sections[0].rows[0].claimText = ""; }],
  ["invalid_claim_offsets", (draft) => { draft.sections[0].rows[0].claimOffsets = [12, 4]; }],
  ["claim_offsets_length_mismatch", (draft) => {
    const row = draft.sections[0].rows[0];
    row.claimOffsets = [0, row.claimText.length + 3];
  }],
  ["missing_marker_id", (draft) => { draft.sections[0].rows[0].markerId = ""; }],
  ["invalid_source_url", (draft) => { draft.sections[0].rows[0].sourceUrl = "not a url"; }],
  ["invalid_accessed_at", (draft) => { draft.sections[0].rows[0].accessedAt = "yesterday"; }],
  ["invalid_verdict", (draft) => { draft.sections[0].rows[0].verdict = "plausible"; }],
  ["invalid_disposition", (draft) => { draft.sections[0].rows[0].proposedDisposition = "hold"; }],
  // keep ⇔ supported only.
  ["illegal_disposition_for_verdict", (draft) => { draft.sections[0].rows[1].proposedDisposition = "keep"; }],
  ["missing_quote", (draft) => { draft.sections[0].rows[0].quote = "   "; }],
  ["unexpected_quote", (draft) => { draft.sections[0].rows[2].quote = "A quote from nowhere."; }],
  ["quote_not_contiguous", (draft) => { draft.sections[0].rows[0].quote = "Testdrug was ... described."; }],
  ["missing_quote_location", (draft) => { draft.sections[0].rows[0].quoteLocation = ""; }],
  ["missing_rationale", (draft) => { draft.sections[0].rows[0].rationale = ""; }],
  ["unexpected_suggested_repair", (draft) => {
    draft.sections[0].rows[0].suggestedRepair = "A repair on a supported verdict.";
  }],
  ["invalid_suggested_repair", (draft) => { draft.sections[0].rows[1].suggestedRepair = "   "; }],
  ["invalid_safety_sensitive", (draft) => { draft.sections[0].rows[0].safetySensitive = "yes"; }],
  ["invalid_refuter", (draft) => { draft.sections[0].rows[0].refuter = { outcome: "maybe" }; }],
];

test("every violation is rejected with its named error", () => {
  for (const [code, mutate] of VIOLATIONS) {
    assert.ok(VALIDATION_ERROR_CODES.includes(code), `${code} is a documented error code`);
    const draft = makeCleanDraft();
    mutate(draft);
    const codes = codesOf(draft);
    assert.ok(codes.includes(code), `expected ${code}, got: ${codes.join(", ") || "(none)"}`);
  }
});

test("legality is excluded outright: five validatable sections, named rejection", () => {
  assert.deepEqual(
    [...VALIDATABLE_SECTIONS],
    ["summary", "pharmacology", "tolerance", "harm_potential", "history_culture"],
  );
  const draft = makeCleanDraft();
  draft.sections[0].section = "legality";
  const codes = codesOf(draft);
  assert.ok(codes.includes("legality_section_excluded"), codes.join(", "));
  assert.ok(!codes.includes("invalid_section"));
});

test("strip and park stay legal for unverifiable; keep does not", () => {
  const draft = makeCleanDraft();
  draft.sections[0].rows[2].proposedDisposition = "strip";
  assert.deepEqual(codesOf(draft), []);
  draft.sections[0].rows[2].proposedDisposition = "keep";
  assert.ok(codesOf(draft).includes("illegal_disposition_for_verdict"));
});

test("non-object draft is rejected", () => {
  assert.deepEqual(codesOf(null), [{
    code: "draft_not_object",
    path: "$",
    message: "Draft must be a JSON object.",
  }].map((error) => error.code));
});

test("CLI rejects the violation fixture and passes the clean fixture", () => {
  const dir = mkdtempSync(join(tmpdir(), "verdict-validate-"));
  const cleanPath = join(dir, "clean-draft.json");
  writeFileSync(cleanPath, JSON.stringify(makeCleanDraft(), null, 2));

  const broken = makeCleanDraft();
  for (const [, mutate] of VIOLATIONS.slice(0, 5)) mutate(broken);
  const brokenPath = join(dir, "broken-draft.json");
  writeFileSync(brokenPath, JSON.stringify(broken, null, 2));

  const pass = spawnSync(process.execPath, [CLI, `--draft-file=${cleanPath}`], { encoding: "utf8" });
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /Verdict draft valid/);

  const reject = spawnSync(process.execPath, [CLI, `--draft-file=${brokenPath}`], { encoding: "utf8" });
  assert.equal(reject.status, 1);
  assert.match(reject.stderr, /ERROR invalid_schema_version/);
  assert.match(reject.stderr, /Verdict draft invalid/);

  // --run=<dir> resolves verdict-draft.json inside the run directory.
  const runDir = join(dir, "run");
  mkdirSync(runDir);
  writeFileSync(join(runDir, "verdict-draft.json"), JSON.stringify(makeCleanDraft(), null, 2));
  const viaRun = spawnSync(process.execPath, [CLI, `--run=${runDir}`], { encoding: "utf8" });
  assert.equal(viaRun.status, 0, viaRun.stderr);
});
