import { createHash } from "node:crypto";

import { CITABLE_ARTICLE_SECTIONS } from "./citation-marker-workflow.mjs";
import {
  collectCitationMarkersFromText,
} from "./citation-only-validator.mjs";

export const AUDIT_SCHEMA_VERSION = "dosewiki_citation_verdict_audit_v1";
export const PACKET_SCHEMA_VERSION = "dosewiki_citation_verdict_packet_v1";
export const DRAFT_SCHEMA_VERSION = "dosewiki_citation_verdict_draft_v1";
export const CITATION_NEEDED_TOKEN = "[citation-needed]";
export const CITABLE_SECTIONS = Object.freeze(
  CITABLE_ARTICLE_SECTIONS.filter((section) => section !== "legality"),
);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (isObjectRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

export function contentHash(value) {
  return sha256Hex(stableJson(value ?? null));
}

export function claimHash(claimText) {
  return sha256Hex(claimText).slice(0, 12);
}

export function buildPairId({ slug, section, markerId, claimText }) {
  return `${slug}:${section}:${markerId}:${claimHash(claimText)}`;
}

function sectionFieldValue(article, section) { return article?.[section] ?? null; }

export function collectSectionProseFields(article, section) {
  const fields = [];
  const walk = (node, path) => {
    if (typeof node === "string") {
      fields.push({ fieldPath: path, text: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (isObjectRecord(node)) {
      for (const key of Object.keys(node).sort()) {
        walk(node[key], `${path}.${key}`);
      }
    }
  };
  walk(sectionFieldValue(article, section), section);
  return fields;
}

function consumeTrailingMarkerRun(text, index) {
  let cursor = index;
  const tokenAt = /^[ \t]*(?:\[cite:[^\]\s]+\]|\[citation-needed\])/;
  for (;;) {
    const match = tokenAt.exec(text.slice(cursor));
    if (!match) return cursor;
    cursor += match[0].length;
  }
}

export function segmentClaims(text) {
  const claims = [];
  const length = text.length;
  let cursor = 0;
  while (cursor < length) {
    while (cursor < length && /\s/.test(text[cursor])) cursor += 1;
    if (cursor >= length) break;
    let end = length;
    for (let index = cursor; index < length; index += 1) {
      const char = text[index];
      if (char !== "." && char !== "!" && char !== "?") continue;
      const afterMarkers = consumeTrailingMarkerRun(text, index + 1);
      const rest = text.slice(afterMarkers);
      if (/^\s*$/.test(rest) || /^\s+[A-Z]/.test(rest)) {
        end = afterMarkers;
        break;
      }
    }
    let trimmedEnd = end;
    while (trimmedEnd > cursor && /\s/.test(text[trimmedEnd - 1])) trimmedEnd -= 1;
    if (trimmedEnd > cursor) {
      claims.push({ start: cursor, end: trimmedEnd, text: text.slice(cursor, trimmedEnd) });
    }
    cursor = end;
  }
  return claims;
}

export function extractClaimPairs(text) {
  const markers = collectCitationMarkersFromText(text);
  if (markers.length === 0) return [];
  const sentences = segmentClaims(text);
  const pairs = [];
  for (const sentence of sentences) {
    const tokens = [
      ...markers.filter((marker) => marker.index >= sentence.start && marker.index < sentence.end),
      ...[...text.slice(sentence.start, sentence.end).matchAll(/\[citation-needed\]/g)]
        .map((match) => ({ index: sentence.start + match.index })),
    ].sort((a, b) => a.index - b.index);
    if (tokens.length === 0) continue;
    const runs = [];
    for (const token of tokens) {
      const last = runs.at(-1);
      if (last && token.index < last.end) {
        last.tokens.push(token);
        last.end = Math.max(last.end, consumeTrailingMarkerRun(text, token.index));
      } else {
        runs.push({ tokens: [token], end: consumeTrailingMarkerRun(text, token.index) });
      }
    }
    for (let index = 0; index < runs.length; index += 1) {
      const run = runs[index];
      const citeMarkers = run.tokens.filter((token) => token.referenceId);
      if (citeMarkers.length === 0) continue;
      let start = index === 0 ? sentence.start : runs[index - 1].end;
      const closesSentence = index === runs.length - 1
        && /^[\s.!?)"']*$/.test(text.slice(run.end, sentence.end));
      const end = closesSentence ? sentence.end : run.end;
      while (start < end && /\s/.test(text[start])) start += 1;
      const claimText = text.slice(start, end);
      const emitted = new Set();
      for (const marker of citeMarkers) {
        if (emitted.has(marker.referenceId)) continue;
        emitted.add(marker.referenceId);
        pairs.push({
          markerId: marker.referenceId,
          markerToken: marker.marker,
          markerIndex: marker.index,
          claimText,
          claimStart: start,
          claimEnd: end,
        });
      }
    }
  }
  return pairs;
}

const SAFETY_SENSITIVE_PATTERNS = Object.freeze([
  /overdose/i,
  /death/i,
  /lethal/i,
  /ld50/i,
  /withdrawal/i,
  /interaction/i,
  /contraindicat/i,
  /maoi/i,
  /\bpoten(?:cy|t)\b/i,
  /affinity/i,
  /equivalen/i,
  /narrow margin/i,
  /highly potent/i,
  /neurotox/i,
  /organ toxicity/i,
  /hepatotox/i,
  /cardiotox/i,
  /pregnan/i,
  /neonat/i,
  /breastfeed/i,
])

export function classifySafetySensitive({ section, claimText }) {
  if (section === "harm_potential") return true;
  const text = typeof claimText === "string" ? claimText : "";
  return SAFETY_SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function buildReferenceIndex(references) { const index = new Map();
for (const reference of references ?? []) {
  if (reference && typeof reference.id === "string" && !index.has(reference.id)) {
    index.set(reference.id, reference);
  }
}
return index; }

export function buildAuditRowsForArticle({ slug, article }) {
  const referenceIndex = buildReferenceIndex(article?.references);
  const rows = [];
  const seen = new Set();
  for (const section of CITABLE_SECTIONS) {
    const value = sectionFieldValue(article, section);
    if (value === null) continue;
    const sectionHash = contentHash(value);
    for (const field of collectSectionProseFields(article, section)) {
      for (const pair of extractClaimPairs(field.text)) {
        const pairId = buildPairId({ slug, section, markerId: pair.markerId, claimText: pair.claimText });
        if (seen.has(pairId)) continue;
        seen.add(pairId);
        const reference = referenceIndex.get(pair.markerId) ?? null;
        rows.push({
          pairId,
          slug,
          section,
          fieldPath: field.fieldPath,
          claimText: pair.claimText,
          claimOffsets: [pair.claimStart, pair.claimEnd],
          markerId: pair.markerId,
          referenceId: reference?.id ?? null,
          referenceUrl: reference?.url ?? null,
          referenceTitle: reference?.title ?? null,
          contentHash: sectionHash,
          safetySensitive: classifySafetySensitive({ section, claimText: pair.claimText }),
          existingVerdict: null,
          actionable: true,
        });
      }
    }
  }
  return rows;
}

function summarizeEvidenceRow(row) {
  return {
    claimKey: row.claimKey ?? null,
    status: row.status ?? null,
    statusReason: row.statusReason ?? null,
    severity: row.severity ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

export function attachExistingVerdicts(rows, evidenceRows, { campaign = null } = {}) {
  const byClaimKey = new Map();
  const fallback = [];
  for (const row of evidenceRows ?? []) {
    if (!isObjectRecord(row)) continue;
    if (campaign !== null && row.provenance?.campaign !== campaign) continue;
    if (typeof row.claimKey === "string" && row.claimKey.length > 0) {
      byClaimKey.set(`${row.slug}\u0000${row.claimKey}`, row);
    }
    fallback.push(row);
  }
  return rows.map((row) => {
    const match = byClaimKey.get(`${row.slug}\u0000${row.pairId}`)
      ?? fallback.find((candidate) => (
        candidate.slug === row.slug
        && candidate.section === row.section
        && typeof candidate.statusReason === "string"
        && candidate.statusReason.startsWith("verdict:")
        && Array.isArray(candidate.referenceIds)
        && candidate.referenceIds.includes(row.markerId)
        && candidate.claimText === row.claimText
      ))
      ?? null;
    const existingVerdict = match ? summarizeEvidenceRow(match) : null;
    return { ...row, existingVerdict, actionable: existingVerdict === null };
  });
}

export function buildAuditTotals(rows) {
  const bySection = Object.fromEntries(CITABLE_SECTIONS.map((section) => [section, 0]));
  const perSlug = {};
  for (const row of rows) {
    bySection[row.section] = (bySection[row.section] ?? 0) + 1;
    perSlug[row.slug] = (perSlug[row.slug] ?? 0) + 1;
  }
  return {
    publicArticles: Object.keys(perSlug).length,
    pairs: rows.length,
    actionable: rows.filter((row) => row.actionable).length,
    sensitiveCount: rows.filter((row) => row.safetySensitive).length,
    bySection,
    perSlug,
  };
}

export class ContentHashDriftError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ContentHashDriftError";
    this.details = details;
  }
}

export function buildVerdictPacket({
  slug,
  section,
  article,
  auditRows,
  evidenceRows = [],
  generatedAt = new Date().toISOString(),
}) {
  if (!CITABLE_SECTIONS.includes(section)) {
    throw new Error(`${section} is not a citable section (${CITABLE_SECTIONS.join(", ")}).`);
  }
  const pairs = (auditRows ?? []).filter((row) => row.slug === slug && row.section === section);
  if (pairs.length === 0) {
    throw new Error(`No audit rows for ${slug} ${section}; nothing to export.`);
  }
  const auditHash = pairs[0].contentHash;
  if (pairs.some((row) => row.contentHash !== auditHash)) {
    throw new Error(`Audit rows for ${slug} ${section} disagree on contentHash; regenerate the audit.`);
  }
  const liveHash = contentHash(sectionFieldValue(article, section));
  if (liveHash !== auditHash) {
    throw new ContentHashDriftError(
      `Live ${section} content for ${slug} (${liveHash.slice(0, 12)}…) no longer matches the audit `
        + `(${auditHash.slice(0, 12)}…). Re-run citations:verdict-audit before exporting.`,
      { slug, section, liveHash, auditHash },
    );
  }
  const referenceIndex = buildReferenceIndex(article?.references);
  const references = [...new Set(pairs.map((row) => row.markerId))]
    .map((markerId) => referenceIndex.get(markerId))
    .filter(Boolean);
  return {
    schemaVersion: PACKET_SCHEMA_VERSION,
    generatedAt,
    slug,
    section,
    contentHash: liveHash,
    pairs,
    references,
    evidenceRows: (evidenceRows ?? []).filter((row) => isObjectRecord(row) && row.section === section),
  };
}

export function buildStrippedMarkerChecks({ operations, articleForWrite }) {
  const written = JSON.stringify(articleForWrite ?? {});
  return (operations ?? [])
    .filter((op) => op.kind === "strip")
    .map((op) => ({
      pairId: op.pairId,
      referenceId: op.markerId,
      stillCitedElsewhere: written.includes(`[cite:${op.markerId}]`),
    }));
}

export function verifyStrippedMarkersInHtml({ html, checks }) {
  const markers = (checks ?? []).map((check) => {
    if (check.stillCitedElsewhere) {
      return { pairId: check.pairId, referenceId: check.referenceId, status: "skipped_still_cited" };
    }
    const visible = [
      `href="#ref-${check.referenceId}"`,
      `data-reference-id="${check.referenceId}"`,
      `[cite:${check.referenceId}]`,
    ].some((needle) => html.includes(needle));
    return {
      pairId: check.pairId,
      referenceId: check.referenceId,
      status: visible ? "still_visible" : "verified",
    };
  });
  return { ok: markers.every((marker) => marker.status !== "still_visible"), markers };
}
