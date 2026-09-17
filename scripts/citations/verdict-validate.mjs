#!/usr/bin/env node
/**
 * Validate a citation verdict draft (`verdict-draft.json`) against the
 * shared draft shape and the verdict contract in docs/workflows/citations.md.
 *
 * Read-only and offline: checks vocabulary, legal verdict/disposition
 * combinations, quote presence rules, suggestedRepair entailment-record rules,
 * offset consistency, pairId format, duplicate pairIds, and the citable
 * section allowlist. Every violation is reported as a named error; the CLI
 * exits non-zero when any is present.
 *
 * Usage:
 *   npm run citations:verdict-validate -- --run=runs/citations/verdicts/<slug>
 *   npm run citations:verdict-validate -- --draft-file=path/to/verdict-draft.json
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import { CITABLE_SECTIONS, DRAFT_SCHEMA_VERSION, claimHash } from "./verdict-lib.mjs";

export const VERDICT_DRAFT_SCHEMA_VERSION = DRAFT_SCHEMA_VERSION;
export const DEFAULT_DRAFT_FILENAME = "verdict-draft.json";

/**
 * Sections a verdict draft may touch. Legality citations are owned entirely
 * by legality-pi: a draft containing a legality section is a named
 * validation error (`legality_section_excluded`), never applied here.
 */
export const VALIDATABLE_SECTIONS = Object.freeze(
  CITABLE_SECTIONS.filter((section) => section !== "legality"),
);

export const VERDICTS = Object.freeze(["supported", "partial", "mismatched", "unverifiable"]);
export const DISPOSITIONS = Object.freeze(["keep", "strip", "park"]);

/**
 * Legal verdict → disposition combinations. Display policy is supported-only:
 * keep exists solely for supported verdicts; strip covers every failed
 * verdict; park is reserved for unverifiable retry eligibility.
 */
export const LEGAL_DISPOSITIONS_BY_VERDICT = Object.freeze({
  supported: Object.freeze(["keep"]),
  partial: Object.freeze(["strip"]),
  mismatched: Object.freeze(["strip"]),
  unverifiable: Object.freeze(["strip", "park"]),
});

export const VALIDATION_ERROR_CODES = Object.freeze([
  "draft_not_object",
  "invalid_schema_version",
  "missing_campaign",
  "missing_wave",
  "missing_slug",
  "invalid_sections",
  "invalid_section",
  "legality_section_excluded",
  "duplicate_section",
  "invalid_content_hash",
  "invalid_rows",
  "invalid_pair_id",
  "pair_id_mismatch",
  "duplicate_pair_id",
  "missing_claim_text",
  "invalid_claim_offsets",
  "claim_offsets_length_mismatch",
  "missing_marker_id",
  "invalid_source_url",
  "invalid_accessed_at",
  "invalid_verdict",
  "invalid_disposition",
  "illegal_disposition_for_verdict",
  "missing_quote",
  "unexpected_quote",
  "quote_not_contiguous",
  "missing_quote_location",
  "missing_rationale",
  "unexpected_suggested_repair",
  "invalid_suggested_repair",
  "invalid_safety_sensitive",
  "invalid_refuter",
]);

const MARKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const CLAIM_HASH_PATTERN = /^[0-9a-f]{12}$/;
// Signatures of a stitched or elided quote; a quote must be one contiguous
// verbatim passage of the fetched source.
const NON_CONTIGUOUS_QUOTE_PATTERN = /\.{3}|…|\[\s*(?:\.\.\.?|…)\s*\]/;
const REFUTER_OUTCOMES = new Set(["confirmed", "refuted"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Split a pairId into its components. markerId may itself contain colons, so
 * parse from both ends: `<slug>:<section>:<markerId>:<12-hex claim hash>`.
 */
export function parsePairId(pairId) {
  if (typeof pairId !== "string") return null;
  const tail = pairId.match(/^(.+):([0-9a-f]{12})$/);
  if (!tail) return null;
  const head = tail[1];
  const claimHashPart = tail[2];
  const headMatch = head.match(/^([^:]+):([^:]+):(.+)$/);
  if (!headMatch) return null;
  const [, slug, section, markerId] = headMatch;
  if (!MARKER_ID_PATTERN.test(markerId)) return null;
  return { slug, section, markerId, claimHash: claimHashPart };
}

function rowPath(sectionIndex, rowIndex) {
  return `sections[${sectionIndex}].rows[${rowIndex}]`;
}

/**
 * Validate a verdict draft. Returns `{ errors }` where each error is
 * `{ code, path, message }` with `code` drawn from VALIDATION_ERROR_CODES.
 */
export function validateVerdictDraft(draft) {
  const errors = [];
  const fail = (code, path, message) => errors.push({ code, path, message });

  if (!isRecord(draft)) {
    fail("draft_not_object", "$", "Draft must be a JSON object.");
    return { errors };
  }

  if (draft.schemaVersion !== VERDICT_DRAFT_SCHEMA_VERSION) {
    fail(
      "invalid_schema_version",
      "schemaVersion",
      `schemaVersion must be "${VERDICT_DRAFT_SCHEMA_VERSION}"; got ${JSON.stringify(draft.schemaVersion)}.`,
    );
  }
  if (!isNonEmptyString(draft.campaign)) {
    fail("missing_campaign", "campaign", "campaign must be a non-empty string.");
  }
  if (!isNonEmptyString(draft.wave) && typeof draft.wave !== "number") {
    fail("missing_wave", "wave", "wave must be a non-empty string or a number.");
  }
  if (!isNonEmptyString(draft.slug)) {
    fail("missing_slug", "slug", "slug must be a non-empty string.");
  }
  if (!Array.isArray(draft.sections) || draft.sections.length === 0) {
    fail("invalid_sections", "sections", "sections must be a non-empty array.");
    return { errors };
  }

  const slug = isNonEmptyString(draft.slug) ? draft.slug.trim() : null;
  const seenSections = new Set();
  const seenPairIds = new Set();

  draft.sections.forEach((sectionEntry, sectionIndex) => {
    const sectionPath = `sections[${sectionIndex}]`;
    if (!isRecord(sectionEntry)) {
      fail("invalid_sections", sectionPath, "Each sections entry must be an object.");
      return;
    }
    const { section } = sectionEntry;
    if (section === "legality") {
      fail(
        "legality_section_excluded",
        `${sectionPath}.section`,
        "Legality citations are owned by legality-pi; verdict drafts must never contain a legality section.",
      );
    } else if (!VALIDATABLE_SECTIONS.includes(section)) {
      fail(
        "invalid_section",
        `${sectionPath}.section`,
        `Section ${JSON.stringify(section)} is not a verdict-draft section (${VALIDATABLE_SECTIONS.join(", ")}).`,
      );
    } else if (seenSections.has(section)) {
      fail("duplicate_section", `${sectionPath}.section`, `Section "${section}" appears more than once.`);
    } else {
      seenSections.add(section);
    }
    if (!CONTENT_HASH_PATTERN.test(sectionEntry.contentHash ?? "")) {
      fail(
        "invalid_content_hash",
        `${sectionPath}.contentHash`,
        "contentHash must be a 64-character lowercase sha256 hex digest.",
      );
    }
    if (!Array.isArray(sectionEntry.rows) || sectionEntry.rows.length === 0) {
      fail("invalid_rows", `${sectionPath}.rows`, "rows must be a non-empty array of verdict rows.");
      return;
    }

    sectionEntry.rows.forEach((row, rowIndex) => {
      const path = rowPath(sectionIndex, rowIndex);
      if (!isRecord(row)) {
        fail("invalid_rows", path, "Each row must be an object.");
        return;
      }
      validateVerdictRow({ row, slug, section, path, seenPairIds, fail });
    });
  });

  return { errors };
}

function validateVerdictRow({ row, slug, section, path, seenPairIds, fail }) {
  const parsed = parsePairId(row.pairId);
  if (!parsed) {
    fail(
      "invalid_pair_id",
      `${path}.pairId`,
      `pairId ${JSON.stringify(row.pairId)} must be "<slug>:<section>:<markerId>:<12-hex claim hash>".`,
    );
  } else {
    if (seenPairIds.has(row.pairId)) {
      fail("duplicate_pair_id", `${path}.pairId`, `pairId ${row.pairId} appears more than once; one row per pair.`);
    }
    seenPairIds.add(row.pairId);
    const mismatches = [];
    if (slug && parsed.slug !== slug) mismatches.push(`slug "${parsed.slug}" ≠ draft slug "${slug}"`);
    if (section && parsed.section !== section) mismatches.push(`section "${parsed.section}" ≠ enclosing section "${section}"`);
    if (isNonEmptyString(row.markerId) && parsed.markerId !== row.markerId) {
      mismatches.push(`markerId "${parsed.markerId}" ≠ row markerId "${row.markerId}"`);
    }
    if (isNonEmptyString(row.claimText) && CLAIM_HASH_PATTERN.test(parsed.claimHash)
      && parsed.claimHash !== claimHash(row.claimText)) {
      mismatches.push(`claim hash "${parsed.claimHash}" ≠ sha256(claimText) prefix "${claimHash(row.claimText)}"`);
    }
    if (mismatches.length > 0) {
      fail("pair_id_mismatch", `${path}.pairId`, `pairId components disagree with the row: ${mismatches.join("; ")}.`);
    }
  }

  if (!isNonEmptyString(row.claimText)) {
    fail("missing_claim_text", `${path}.claimText`, "claimText must be the exact article sentence.");
  }

  const offsets = row.claimOffsets;
  if (
    !Array.isArray(offsets)
    || offsets.length !== 2
    || !Number.isInteger(offsets[0])
    || !Number.isInteger(offsets[1])
    || offsets[0] < 0
    || offsets[1] <= offsets[0]
  ) {
    fail(
      "invalid_claim_offsets",
      `${path}.claimOffsets`,
      "claimOffsets must be [start, end) integers with 0 <= start < end.",
    );
  } else if (isNonEmptyString(row.claimText) && offsets[1] - offsets[0] !== row.claimText.length) {
    fail(
      "claim_offsets_length_mismatch",
      `${path}.claimOffsets`,
      `claimOffsets span ${offsets[1] - offsets[0]} characters but claimText has ${row.claimText.length}.`,
    );
  }

  if (!isNonEmptyString(row.markerId) || !MARKER_ID_PATTERN.test(row.markerId)) {
    fail("missing_marker_id", `${path}.markerId`, "markerId must be a valid [cite:<id>] reference id.");
  }
  if (!isHttpUrl(row.sourceUrl)) {
    fail("invalid_source_url", `${path}.sourceUrl`, "sourceUrl must be the http(s) URL actually fetched.");
  }
  if (!isIsoTimestamp(row.accessedAt)) {
    fail("invalid_accessed_at", `${path}.accessedAt`, "accessedAt must be a parseable UTC timestamp.");
  }

  const verdictKnown = VERDICTS.includes(row.verdict);
  if (!verdictKnown) {
    fail(
      "invalid_verdict",
      `${path}.verdict`,
      `verdict ${JSON.stringify(row.verdict)} must be one of: ${VERDICTS.join(", ")}.`,
    );
  }
  const dispositionKnown = DISPOSITIONS.includes(row.proposedDisposition);
  if (!dispositionKnown) {
    fail(
      "invalid_disposition",
      `${path}.proposedDisposition`,
      `proposedDisposition ${JSON.stringify(row.proposedDisposition)} must be one of: ${DISPOSITIONS.join(", ")}.`,
    );
  }
  if (verdictKnown && dispositionKnown
    && !LEGAL_DISPOSITIONS_BY_VERDICT[row.verdict].includes(row.proposedDisposition)) {
    fail(
      "illegal_disposition_for_verdict",
      `${path}.proposedDisposition`,
      `Disposition "${row.proposedDisposition}" is illegal for verdict "${row.verdict}"; `
        + `legal: ${LEGAL_DISPOSITIONS_BY_VERDICT[row.verdict].join(", ")}.`,
    );
  }

  const quote = typeof row.quote === "string" ? row.quote : "";
  if ((row.verdict === "supported" || row.verdict === "partial") && quote.trim().length === 0) {
    fail("missing_quote", `${path}.quote`, `A ${row.verdict} verdict requires a non-empty verbatim quote.`);
  }
  if (row.verdict === "unverifiable" && quote.trim().length > 0) {
    fail("unexpected_quote", `${path}.quote`, "An unverifiable verdict must carry an empty quote.");
  }
  if (quote.trim().length > 0 && NON_CONTIGUOUS_QUOTE_PATTERN.test(quote)) {
    fail(
      "quote_not_contiguous",
      `${path}.quote`,
      "quote must be one contiguous verbatim passage; ellipses and stitched fragments invalidate the row.",
    );
  }
  if (quote.trim().length > 0 && !isNonEmptyString(row.quoteLocation)) {
    fail("missing_quote_location", `${path}.quoteLocation`, "A non-empty quote requires quoteLocation.");
  }
  if (!isNonEmptyString(row.rationale)) {
    fail("missing_rationale", `${path}.rationale`, "rationale is required for every verdict row.");
  }

  if (row.suggestedRepair !== undefined) {
    if (row.verdict !== "partial") {
      fail(
        "unexpected_suggested_repair",
        `${path}.suggestedRepair`,
        "suggestedRepair is an entailment record for partial verdicts only.",
      );
    } else if (!isNonEmptyString(row.suggestedRepair)) {
      fail("invalid_suggested_repair", `${path}.suggestedRepair`, "suggestedRepair must be a non-empty sentence when present.");
    }
  }

  if (typeof row.safetySensitive !== "boolean") {
    fail("invalid_safety_sensitive", `${path}.safetySensitive`, "safetySensitive must be a boolean.");
  }

  if (row.refuter !== undefined) {
    if (
      !isRecord(row.refuter)
      || !REFUTER_OUTCOMES.has(row.refuter.outcome)
      || !isNonEmptyString(row.refuter.reason)
    ) {
      fail(
        "invalid_refuter",
        `${path}.refuter`,
        'refuter must be { outcome: "confirmed" | "refuted", reason: <non-empty> } when present.',
      );
    }
  }
}

export function validateVerdictDraftFile(draftPath) {
  if (!existsSync(draftPath)) {
    return { errors: [{ code: "draft_not_object", path: "$", message: `Missing verdict draft: ${draftPath}` }] };
  }
  let draft;
  try {
    draft = JSON.parse(readFileSync(draftPath, "utf8"));
  } catch (error) {
    return { errors: [{ code: "draft_not_object", path: "$", message: `Unreadable verdict draft: ${error.message}` }] };
  }
  return validateVerdictDraft(draft);
}

function resolveDraftPath(argv) {
  const draftFile = getFlagValue(argv, "--draft-file")?.trim();
  if (draftFile) return resolve(draftFile);
  const runDir = getFlagValue(argv, "--run")?.trim();
  if (runDir) return resolve(runDir, DEFAULT_DRAFT_FILENAME);
  throw new Error("Pass --run=<dir> (containing verdict-draft.json) or --draft-file=<path>.");
}

export function main(argv = process.argv.slice(2)) {
  const draftPath = resolveDraftPath(argv);
  const { errors } = validateVerdictDraftFile(draftPath);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR ${error.code} at ${error.path}: ${error.message}`);
    }
    console.error(`Verdict draft invalid: ${errors.length} error(s) in ${draftPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Verdict draft valid: ${draftPath}`);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  }
}
