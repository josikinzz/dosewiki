#!/usr/bin/env node
/**
 * Apply one validated citation-pi verdict draft to a single article, modeled
 * on scripts/legality/apply-draft.mjs and the workbench citation write path.
 *
 * Semantics (see docs/workflows/citations.md, verdict contract):
 *   keep  → citation evidence row set `supported` with the verdict's quote
 *           and rationale; the marker is untouched.
 *   strip → the exact `[cite:<id>]` token is replaced with `[citation-needed]`
 *           in the field string, and the evidence row is set `needs_source`
 *           with `statusReason` carrying the full verdict record.
 *   park  → no-op (recorded in the plan only).
 *
 * Marker-token replacement is the ONLY permitted textual delta. The plan
 * builder refuses on live content-hash drift, on markers absent from the live
 * field, and on any operation that would change text beyond the single token
 * replacement (checked by stripping both token kinds from before/after and
 * requiring identical strings).
 *
 * Usage:
 *   DATA_BACKEND=postgres npm run citations:verdict-apply -- --slug=<slug> --dry-run --target=<postgres-url> --expected-deployment=<host>/<database>
 *   DATA_BACKEND=postgres TARGET_POSTGRES_URL=<postgres-url> POSTGRES_IMPORT_CONFIRM=<host> npm run citations:verdict-apply -- \
 *     --slug=<slug> --write --allow-remote --confirm-citation-write \
 *     --confirm-write=apply-citation-verdict-draft --expected-deployment=<host>/<database>
 *
 * Options:
 *   --slug=<slug>            Article slug (required; must match the draft).
 *   --draft-file=<path>      Verdict draft (default runs/citations/verdicts/<slug>/verdict-draft.json).
 *   --article-file=<path>    Offline article fixture for dry-run previews and tests; never valid with --write.
 *   --dry-run                Print the full plan and stop (default).
 *   --write                  Persist through native citationEvidence.applyDraft with the guard stack.
 *   --revalidate-url=<url>   Editor-host origin serving /api/dev/revalidate-article
 *                            (default $DOSEWIKI_REVALIDATE_URL, else https://dev.dose.wiki).
 *                            After a successful --write the script POSTs the slug there so
 *                            the public page re-renders now instead of on the next 1-hour
 *                            ISR window; authenticated with the same citationEvidenceWrite
 *                            token as the Postgres write. Failure is a WARNING recorded in
 *                            the receipt — the write itself stays valid.
 *   --verify-public-url=<url> Optionally fetch <url>/<slug> after revalidation and confirm
 *                            each fully-stripped reference no longer renders; recorded in
 *                            the receipt as publicVerification. Skipped when absent.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import { requiresStrictCitationReview } from "../../lib/citations/citationSafety.mjs";
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
createDataOpsRunContext,
getFlagValue,
printDataOpsRunContext,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"
import {
  CITATION_NEEDED_TOKEN,
  ContentHashDriftError,
  buildStrippedMarkerChecks,
  collectSectionProseFields,
  contentHash,
  verifyStrippedMarkersInHtml,
} from "./verdict-lib.mjs";
import { validateVerdictDraft } from "./verdict-validate.mjs";

const CITE_TOKEN_PATTERN = /\[cite:[^\]\s]+\]/g;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stripDataMetadata(article) {
  const { _id, _creationTime, ...clean } = article;
  return clean;
}

/** Remove both token kinds: `[cite:<id>]` markers and `[citation-needed]`. */
export function stripVerdictTokens(text) {
  return String(text ?? "")
    .replaceAll(CITATION_NEEDED_TOKEN, "")
    .replace(CITE_TOKEN_PATTERN, "");
}

/**
 * Guard: a patched field may differ from the live field only by marker-token
 * replacement. Stripping both token kinds from each side must leave the
 * surrounding prose byte-identical.
 */
export function assertTokenOnlyDelta({ fieldPath, before, after }) {
  if (stripVerdictTokens(before) !== stripVerdictTokens(after)) {
    throw new Error(
      `text_delta_beyond_token: applying the draft to ${fieldPath} would change text beyond `
        + "the [cite:<id>] → [citation-needed] token replacement.",
    );
  }
}


function locateClaim({ section, fields, row }) {
  const [start, end] = row.claimOffsets;
  const matches = fields.filter((field) => (
    end <= field.text.length && field.text.slice(start, end) === row.claimText
  ));
  if (matches.length === 0) {
    throw new Error(
      `claim_not_found: ${row.pairId} does not match any live ${section} field at offsets `
        + `[${start}, ${end}); the article has drifted from the draft.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `ambiguous_claim: ${row.pairId} matches ${matches.length} live ${section} fields `
        + `(${matches.map((field) => field.fieldPath).join(", ")}).`,
    );
  }
  return matches[0];
}

function locateMarker({ field, row }) {
  const [start, end] = row.claimOffsets;
  const token = `[cite:${row.markerId}]`;
  const indexes = [];
  let cursor = field.text.indexOf(token, start);
  while (cursor !== -1 && cursor < end) {
    indexes.push(cursor);
    cursor = field.text.indexOf(token, cursor + token.length);
  }
  if (indexes.length === 0) {
    throw new Error(
      `marker_not_found: ${token} is absent from the live claim for ${row.pairId} (${field.fieldPath}).`,
    );
  }
  return { token, indexes };
}

function setDeep(target, fieldPath, value) {
  const segments = fieldPath.split(/\.|\[(\d+)\]/).filter((segment) => segment !== undefined && segment !== "");
  let node = { root: target };
  let key = "root";
  for (const segment of segments) {
    node = node[key];
    key = /^\d+$/.test(segment) ? Number(segment) : segment;
  }
  node[key] = value;
}

function referenceById(article, referenceId) {
  const references = Array.isArray(article.references) ? article.references : [];
  return references.find((reference) => reference?.id === referenceId) ?? null;
}

function stripStatusReason(row) {
  const parts = [`verdict:${row.verdict}`, row.rationale];
  if (row.suggestedRepair) parts.push(`suggestedRepair: ${row.suggestedRepair}`);
  return parts.join("; ");
}

function severityForRow(section, row) {
  return row.safetySensitive || section === "harm_potential" ? "blocking" : "non_blocking";
}

function provenanceForRow(draft, row, disposition) {
  return {
    source: "dosewiki-citation-pi",
    campaign: draft.campaign,
    wave: draft.wave,
    pairId: row.pairId,
    verdict: row.verdict,
    disposition,
    sourceUrl: row.sourceUrl,
    accessedAt: row.accessedAt,
    ...(row.quoteLocation ? { quoteLocation: row.quoteLocation } : {}),
    ...(row.refuter ? { refuter: row.refuter } : {}),
  };
}

function keepEvidenceRow({ article, draft, section, row, fieldPath }) {
  const reference = referenceById(article, row.markerId);
  if (!reference) {
    throw new Error(
      `unknown_reference: ${row.pairId} keeps [cite:${row.markerId}] but the live article has no such reference.`,
    );
  }
  const sourceName = reference.title || reference.url || row.markerId;
  const claim = { claimKey: row.pairId, fieldPath, claimText: row.claimText };
  const needsStrictReview = requiresStrictCitationReview(claim);
  let strictReviewEvidence;
  if (needsStrictReview) {
    if (row.refuter?.outcome !== "confirmed") {
      throw new Error(
        `missing_refuter_confirmation: safety-sensitive keep ${row.pairId} requires a `
          + 'refuter record with outcome "confirmed" before evidence can publish.',
      );
    }
    strictReviewEvidence = {
      decision: "approved",
      reviewedBy: "citation-pi-refuter",
      reviewedAt: row.accessedAt,
      claimKey: row.pairId,
      fieldPath,
      claimText: row.claimText,
      referenceIds: [row.markerId],
      rationale: row.refuter.reason,
    };
  }
  const support = {
    sourceId: row.markerId,
    sourceName,
    referenceId: row.markerId,
    supportingQuote: row.quote,
    rationale: row.rationale,
    verifiedQuote: {
      sourceId: row.markerId,
      matchType: "normalized_whitespace",
      startOffset: null,
      endOffset: null,
    },
  };
  return {
    section,
    claimKey: row.pairId,
    claimText: row.claimText,
    fieldPath,
    entailmentVerdict: "entails",
    ...(strictReviewEvidence ? { strictReviewEvidence } : {}),
    referenceIds: [row.markerId],
    sourceName,
    status: "supported",
    severity: severityForRow(section, row),
    supportingSnippet: row.quote,
    supportRationale: row.rationale,
    supports: [support],
    provenance: provenanceForRow(draft, row, "keep"),
  };
}

function stripEvidenceRow({ draft, section, row, fieldPath }) {
  return {
    section,
    claimKey: row.pairId,
    claimText: row.claimText,
    fieldPath,
    referenceIds: [],
    status: "needs_source",
    statusReason: stripStatusReason(row),
    severity: severityForRow(section, row),
    supports: [],
    provenance: provenanceForRow(draft, row, "strip"),
  };
}

/**
 * Build the full apply plan from a live article and a validated verdict
 * draft. Pure: throws named errors (`content_hash_drift`, `claim_not_found`,
 * `marker_not_found`, `text_delta_beyond_token`, …) and never mutates inputs.
 */
export function buildVerdictApplyPlan({ article, draft }) {
  const operations = [];
  const evidence = [];
  const sectionPatches = {};
  const seenPairIds = new Set();

  for (const sectionEntry of draft.sections) {
    const { section } = sectionEntry;
    const liveValue = article?.[section];
    if (liveValue === undefined || liveValue === null) {
      throw new Error(`missing_section: the live article has no ${section} section.`);
    }
    const liveHash = contentHash(liveValue);
    if (liveHash !== sectionEntry.contentHash) {
      throw new ContentHashDriftError(
        `content_hash_drift: live ${section} hash ${liveHash} does not match draft hash `
          + `${sectionEntry.contentHash}; re-export and re-research before applying.`,
        { section, liveHash, draftHash: sectionEntry.contentHash },
      );
    }

    const fields = collectSectionProseFields(article, section);
    const stripsByField = new Map();

    for (const row of sectionEntry.rows) {
      if (seenPairIds.has(row.pairId)) {
        throw new Error(`duplicate_pair: ${row.pairId} appears more than once in the draft.`);
      }
      seenPairIds.add(row.pairId);

      const field = locateClaim({ section, fields, row });
      const marker = locateMarker({ field, row });
      const disposition = row.proposedDisposition;

      if (disposition === "park") {
        operations.push({
          kind: "park",
          pairId: row.pairId,
          section,
          fieldPath: field.fieldPath,
          markerId: row.markerId,
          verdict: row.verdict,
        });
        continue;
      }

      if (disposition === "keep") {
        evidence.push(keepEvidenceRow({ article, draft, section, row, fieldPath: field.fieldPath }));
        operations.push({
          kind: "keep",
          pairId: row.pairId,
          section,
          fieldPath: field.fieldPath,
          markerId: row.markerId,
          verdict: row.verdict,
        });
        continue;
      }

      evidence.push(stripEvidenceRow({ draft, section, row, fieldPath: field.fieldPath }));
      operations.push({
        kind: "strip",
        pairId: row.pairId,
        section,
        fieldPath: field.fieldPath,
        markerId: row.markerId,
        verdict: row.verdict,
        tokenIndex: marker.indexes[0],
        tokenIndexes: marker.indexes,
        token: marker.token,
      });
      if (!stripsByField.has(field.fieldPath)) {
        stripsByField.set(field.fieldPath, { text: field.text, strips: [] });
      }
      for (const index of marker.indexes) {
        stripsByField.get(field.fieldPath).strips.push({ index, token: marker.token });
      }

    }

    if (stripsByField.size > 0) {
      const patched = structuredClone(liveValue);
      for (const [fieldPath, { text, strips }] of stripsByField) {
        let next = text;
        for (const strip of [...strips].sort((left, right) => right.index - left.index)) {
          if (next.slice(strip.index, strip.index + strip.token.length) !== strip.token) {
            throw new Error(
              `marker_not_found: ${strip.token} is no longer at offset ${strip.index} of ${fieldPath}.`,
            );
          }
          next = next.slice(0, strip.index) + CITATION_NEEDED_TOKEN + next.slice(strip.index + strip.token.length);
        }
        assertTokenOnlyDelta({ fieldPath, before: text, after: next });
        if (fieldPath === section) {
          sectionPatches[section] = next;
        } else {
          setDeep(
            { [section]: patched },
            fieldPath,
            next,
          );
          sectionPatches[section] = patched;
        }
      }
    }
  }

  const totals = {
    keep: operations.filter((op) => op.kind === "keep").length,
    strip: operations.filter((op) => op.kind === "strip").length,
    park: operations.filter((op) => op.kind === "park").length,
    evidenceRows: evidence.length,
    patchedSections: Object.keys(sectionPatches).length,
  };
  return { slug: draft.slug, operations, evidence, sectionPatches, totals };
}

export function printPlan(plan) {
  for (const op of plan.operations) {
    if (op.kind === "keep") {
      console.log(`KEEP ${op.pairId} ref=${op.markerId} field=${op.fieldPath} evidence=supported`);
    } else if (op.kind === "strip") {
      console.log(
        `STRIP ${op.pairId} field=${op.fieldPath} @${op.tokenIndex} ${op.token} -> `
          + `${CITATION_NEEDED_TOKEN} evidence=needs_source verdict=${op.verdict}`,
      );
    } else {
      console.log(`PARK ${op.pairId} field=${op.fieldPath} verdict=${op.verdict}`);
    }
  }
  console.log(
    `TOTALS: ${plan.totals.keep} keep, ${plan.totals.strip} strip, ${plan.totals.park} park; `
      + `${plan.totals.evidenceRows} evidence rows; ${plan.totals.patchedSections} patched section(s)`,
  );
}

const DEFAULT_REVALIDATE_BASE_URL = "https://dev.dose.wiki";
const REVALIDATE_ROUTE_PATH = "/api/dev/revalidate-article";

/**
 * POST the slug to the editor host's revalidate route so the public page
 * re-renders now instead of on the next 1-hour ISR window
 * (`src/app/api/dev/revalidate-article/route.ts`). Never throws: the Postgres
 * write has already landed and stays valid; a failure here only means public
 * visibility lags by up to an hour.
 */
export async function requestArticleRevalidation({ slug, revalidateBaseUrl, token, fetchImpl = fetch }) {
  const url = `${revalidateBaseUrl.replace(/\/+$/, "")}${REVALIDATE_ROUTE_PATH}`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ slug }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      const detail = payload?.error ?? `unexpected response ${JSON.stringify(payload)}`;
      return { ok: false, url, error: `revalidation_http_${response.status}: ${detail}` };
    }
    return { ok: true, url, paths: payload.revalidated };
  } catch (error) {
    return { ok: false, url, error: `revalidation_unreachable: ${error?.message ?? error}` };
  }
}

/**
 * Fetch the live public page and assert each fully-stripped reference no
 * longer renders (no superscript link, no leaked raw token). Never throws.
 */
export async function verifyPublicArticle({ slug, publicBaseUrl, checks, fetchImpl = fetch }) {
  const url = `${publicBaseUrl.replace(/\/+$/, "")}/${slug}`;
  if (checks.length === 0) {
    return { ok: true, url, markers: [] };
  }
  try {
    const response = await fetchImpl(url, { headers: { Accept: "text/html" } });
    if (!response.ok) {
      return { ok: false, url, error: `public_fetch_http_${response.status}` };
    }
    const html = await response.text();
    return { url, ...verifyStrippedMarkersInHtml({ html, checks }) };
  } catch (error) {
    return { ok: false, url, error: `public_fetch_unreachable: ${error?.message ?? error}` };
  }
}

/**
 * Post-write visibility step: revalidate the public page, then optionally
 * verify the stripped markers are gone from the live HTML. Returns the
 * receipt fields (`revalidation`, and `publicVerification` when a public URL
 * is given). Failures are warnings — the Postgres write is already durable and
 * at worst the page refreshes on the next ISR window.
 */
export async function recordPostWriteVisibility({
  slug,
  plan,
  articleForWrite,
  token,
  revalidateBaseUrl,
  verifyPublicBaseUrl = null,
  fetchImpl = fetch,
  warn = console.warn,
}) {
  const revalidation = await requestArticleRevalidation({ slug, revalidateBaseUrl, token, fetchImpl });
  if (!revalidation.ok) {
    warn(
      `WARNING: revalidation failed for ${slug} (${revalidation.error}). `
        + "The Postgres write is valid; the public page refreshes on the next ISR window (up to 1h).",
    );
  }
  if (!verifyPublicBaseUrl) {
    return { revalidation };
  }

  const checks = buildStrippedMarkerChecks({ operations: plan.operations, articleForWrite });
  const publicVerification = await verifyPublicArticle({
    slug,
    publicBaseUrl: verifyPublicBaseUrl,
    checks,
    fetchImpl,
  });
  if (!publicVerification.ok) {
    const detail = publicVerification.error
      ?? publicVerification.markers
        .filter((marker) => marker.status === "still_visible")
        .map((marker) => marker.pairId)
        .join(", ");
    warn(`WARNING: public verification failed for ${slug} (${detail}).`);
  }
  return { revalidation, publicVerification };
}

function requireSlug(argv) {
  const slug = getFlagValue(argv, "--slug")?.trim();
  if (!slug) throw new Error("--slug=<slug> is required.");
  return slug;
}

function loadArticleFixture(articleFile) {
  const path = resolve(articleFile);
  if (!existsSync(path)) {
    throw new Error(`Missing article fixture: ${path}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return isRecord(parsed.article) ? parsed.article : parsed;
}

export async function main(argv = process.argv.slice(2)) {
  const slug = requireSlug(argv);
  const write = argv.includes("--write");
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }
  const articleFile = getFlagValue(argv, "--article-file")?.trim() || null;
  if (write && articleFile) {
    throw new Error("--article-file is a dry-run preview aid; it is never valid with --write.");
  }

  const draftFile = getFlagValue(argv, "--draft-file")?.trim()
    || resolve("runs", "citations", "verdicts", slug, "verdict-draft.json");
  const draftPath = resolve(draftFile);
  if (!existsSync(draftPath)) {
    throw new Error(`Missing verdict draft: ${draftPath}`);
  }

  const runContext = createDataOpsRunContext({
    // operationName "apply-citation-verdict-draft" is the required
    // --confirm-write phrase for production writes.
    operation: "apply citation verdict draft",
    intent: "citation-verdicts",
    argv,
    sourceUrlKeys: [],
    targetUrlKeys: ["TARGET_POSTGRES_URL"],
    dryRunFlag: "--dry-run",
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: "--confirm-citation-write",
    selectedTables: ["substanceIndex", "citationEvidence"],
    localArtifacts: [draftPath],
    destructive: true,
  });
  if (!write) {
    runContext.dryRun = true;
    runContext.writeEnabled = false;
  }

  const draft = JSON.parse(readFileSync(draftPath, "utf8"));
  const { errors } = validateVerdictDraft(draft);
  if (errors.length > 0) {
    const rendered = errors.map((error) => `  ${error.code} at ${error.path}: ${error.message}`).join("\n");
    throw new Error(`Verdict draft failed validation (${errors.length} error(s)):\n${rendered}`);
  }
  if (draft.slug !== slug) {
    throw new Error(`Draft slug ${draft.slug} does not match --slug=${slug}.`);
  }

  let client = null;
  let article;
  if (articleFile) {
    article = loadArticleFixture(articleFile);
  } else {
    const targetUrl = requireTargetUrl(runContext, "Postgres citation target URL");
    client = createDataClient({ target: targetUrl }).client;
    article = await client.query(api.substanceIndex.getBySlug, { slug });
  }
  if (!article) throw new Error(`No article found for slug: ${slug}`);

  const plan = buildVerdictApplyPlan({ article, draft });
  printPlan(plan);
  if (!write) {
    console.log(
      "No writes performed. Re-run with --write --confirm-citation-write "
        + "--confirm-write=apply-citation-verdict-draft --expected-deployment=<host>/<database> to update Postgres.",
    );
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  printDataOpsRunContext(runContext);
  const adminToken = requireAdminIntentToken("citationEvidenceWrite");
  const { path: auditLogPath } = writeAuditLog({
    operation: "citation-verdict-apply",
    intent: "citationEvidenceWrite",
    slug,
    mutations: plan.operations
      .filter((op) => op.kind !== "park")
      .map((op) => ({
        pairId: op.pairId,
        action: op.kind === "strip" ? "strip-marker" : "keep-supported",
        field: op.fieldPath,
      })),
    repoRoot: runContext.repoRoot,
  });

  const { path: backupPath, documentCount } = await backupBeforeWrite({
    sourceClient: client,
    queryGetAll: api.substanceIndex.getBySlug,
    queryArgs: { slug },
    label: `citation-verdict-apply-${slug}`,
    repoRoot: runContext.repoRoot,
  });

  const articleForWrite = {
    ...stripDataMetadata(article),
    ...plan.sectionPatches,
  };
  const writeResult = await client.mutation(api.citationEvidence.applyDraft, {
    apiKey: adminToken.token,
    slug,
    article: articleForWrite,
    evidence: plan.evidence,
    approvedWriteMode: "preserve",
  });
  if (writeResult?.article?.updated !== true) {
    throw new Error(`Citation verdict write did not update ${slug}: ${JSON.stringify(writeResult)}`);
  }

  // Post-write visibility: the mutation is durable, so from here on failures
  // downgrade to warnings recorded in the receipt (at worst the public page
  // refreshes on the next 1-hour ISR window).
  const revalidateBaseUrl = getFlagValue(argv, "--revalidate-url")?.trim()
    || process.env.DOSEWIKI_REVALIDATE_URL?.trim()
    || DEFAULT_REVALIDATE_BASE_URL;
  const verifyPublicBaseUrl = getFlagValue(argv, "--verify-public-url")?.trim() || null;
  const visibility = await recordPostWriteVisibility({
    slug,
    plan,
    articleForWrite,
    token: adminToken.token,
    revalidateBaseUrl,
    verifyPublicBaseUrl,
  });

  const appliedPath = draftPath.replace(/\.json$/, "-applied.json").replace(/verdict-draft-applied\.json$/, "verdict-applied.json");
  const applied = {
    slug,
    appliedAt: new Date().toISOString(),
    deployment: runContext.deploymentFingerprint,
    draftPath,
    totals: plan.totals,
    kept: plan.operations.filter((op) => op.kind === "keep").map((op) => op.pairId),
    stripped: plan.operations.filter((op) => op.kind === "strip").map((op) => op.pairId),
    parked: plan.operations.filter((op) => op.kind === "park").map((op) => op.pairId),
    revalidation: visibility.revalidation,
    ...(visibility.publicVerification ? { publicVerification: visibility.publicVerification } : {}),
  };
  writeFileSync(appliedPath, `${JSON.stringify(applied, null, 2)}\n`);
  updateAuditLog(auditLogPath, {
    status: "completed",
    backupPath,
    result: writeResult,
    appliedPath,
  });
  console.log(
    `Applied ${slug} on ${runContext.deploymentFingerprint}: ${plan.totals.keep} keep, `
      + `${plan.totals.strip} strip, ${plan.totals.park} park.`,
  );
  console.log(
    visibility.revalidation.ok
      ? `Revalidated ${visibility.revalidation.paths.join(", ")} via ${visibility.revalidation.url}.`
      : `Revalidation FAILED (${visibility.revalidation.error}); public visibility lags up to 1h.`,
  );
  if (visibility.publicVerification) {
    console.log(
      visibility.publicVerification.ok
        ? `Public verification passed at ${visibility.publicVerification.url}.`
        : `Public verification FAILED at ${visibility.publicVerification.url}.`,
    );
  }
  console.log(`Backup: ${backupPath} (${documentCount} document(s)); audit: ${auditLogPath}; receipt: ${appliedPath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
}
