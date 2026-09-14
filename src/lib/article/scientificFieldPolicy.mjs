/**
 * Path-aware translation policy for scientific article fields.
 *
 * Global corpus exclusions remain the conservative default. This module only
 * nominates observed reader-facing leaves whose schema key is otherwise too
 * broad (for example `route`, `species`, or `half_life`). Projected spans keep
 * source quantities and scientific identities outside translated text.
 */

const CITATION_TOKEN = /\[cite:[^\]]+\]/g;
const SOURCE_QUANTITY = /(?:[<>~≈±]?\s*\d[\d.,]*(?:\s*(?:-|–|—|to)\s*\d[\d.,]*)?\s*(?:%|mg\/kg|mg|g|kg|ug|µg|mcg|ng|mL|ml|L|mol|nM|µM|uM|mM|hours?|hrs?|h|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|years?))(?![A-Za-z])/gi;
const SCIENTIFIC_ACRONYM = /\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Z]+\d+[A-Z0-9-]*)\b/g;
const METABOLITE_STATUS = /^(active|inactive)$/i;
const ABBREVIATION = /^(?=.*[A-Z])[A-Z0-9α-ωΑ-Ω+.-]{2,}$/;

export const SCIENTIFIC_FIELD_ROLES = Object.freeze({
  CANONICAL_IDENTIFIER: "canonical-identifier",
  CONTROLLED_LABEL: "controlled-label",
  PROSE: "prose",
  IDENTIFIER_PLUS_PROSE: "identifier-plus-prose",
});

const EXACT_POLICIES = Object.freeze([
  { path: /^pharmacology\.metabolites\[\]$/, role: SCIENTIFIC_FIELD_ROLES.IDENTIFIER_PLUS_PROSE, projector: "metabolite" },
  { path: /^pharmacology\.half_life$/, role: SCIENTIFIC_FIELD_ROLES.IDENTIFIER_PLUS_PROSE, projector: "scientific-prose" },
  { path: /^pharmacology\.route_half_life\.[^.]+$/, role: SCIENTIFIC_FIELD_ROLES.IDENTIFIER_PLUS_PROSE, projector: "scientific-prose" },
  { path: /^duration\.routes\[\]\.half_life$/, role: SCIENTIFIC_FIELD_ROLES.IDENTIFIER_PLUS_PROSE, projector: "scientific-prose" },
  { path: /^harm_potential\.toxicity\.(?:lethal_dosage\.)?ld50\[\]\.species$/, role: SCIENTIFIC_FIELD_ROLES.CONTROLLED_LABEL, projector: "label" },
  { path: /^harm_potential\.toxicity\.(?:lethal_dosage\.)?ld50\[\]\.route$/, role: SCIENTIFIC_FIELD_ROLES.CONTROLLED_LABEL, projector: "label" },
  { path: /^harm_potential\.toxicity\.carcinogenicity\.evidence\.animal_models\.species\[\]$/, role: SCIENTIFIC_FIELD_ROLES.CONTROLLED_LABEL, projector: "label" },
  { path: /^harm_potential\.toxicity\.carcinogenicity\.evidence\.in_vitro\.(?:type|assay_type)$/, role: SCIENTIFIC_FIELD_ROLES.PROSE, projector: "scientific-prose" },
]);

const EXPLICIT_IDENTITIES = Object.freeze([
  /^identification(?:\.|$)/,
  /^classification(?:\.|$)/,
  /^harm_potential\.toxicity\.organ_toxicity\[\]\.system$/,
  /(?:^|\.)(?:target|reference_id|reference_ids|citation|citations|source_citations)(?:\[\]|\.|$)/,
  /(?:^|\.)(?:reagent|reagents|brand|brands|statute|credit|attribution)(?:\[\]|\.|$)/,
]);

export function normalizeScientificPath(pointer) {
  if (typeof pointer === "string") return pointer.replace(/\[\d+\]/g, "[]");
  return pointer
    .map((part, index) => typeof part === "number" ? "[]" : `${index > 0 && !String(part).startsWith("[") ? "." : ""}${part}`)
    .join("")
    .replace(/\.\[\]/g, "[]");
}

export function resolveScientificFieldPolicy(pointer) {
  const path = normalizeScientificPath(pointer);
  if (EXPLICIT_IDENTITIES.some((pattern) => pattern.test(path))) {
    return { path, role: SCIENTIFIC_FIELD_ROLES.CANONICAL_IDENTIFIER, projector: null };
  }
  const policy = EXACT_POLICIES.find((candidate) => candidate.path.test(path));
  return policy ? { path, role: policy.role, projector: policy.projector } : null;
}

function collectProtectedRanges(value, patterns) {
  const ranges = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((range, index, all) => index === 0 || range.start >= all[index - 1].end);
}

function projectionFromProtectedRanges(value, policy, protectedRanges) {
  const spans = [];
  let cursor = 0;
  for (const range of protectedRanges) {
    if (range.start > cursor) spans.push({ start: cursor, end: range.start, source: value.slice(cursor, range.start) });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < value.length) spans.push({ start: cursor, end: value.length, source: value.slice(cursor) });
  const translatableSpans = spans.filter((span) => /[A-Za-z]{2}/.test(span.source));
  if (translatableSpans.length === 0) return null;
  return { path: policy.path, role: policy.role, source: value, spans: translatableSpans };
}

/** The same metabolite structure consumed by extraction and the public renderer. */
export function projectMetaboliteDisplay(raw) {
  const citationTokens = raw.match(CITATION_TOKEN) ?? [];
  const visible = raw.replace(CITATION_TOKEN, "").trim();
  const match = visible.match(/^(.+?)\s*\(([^()]*)\)\s*$/);
  if (!match) return { name: visible, citationTokens, qualifications: [] };

  const parts = match[2].split(/,\s*/).map((part) => part.trim()).filter(Boolean);
  const abbreviation = parts[0] && ABBREVIATION.test(parts[0]) ? parts.shift() : undefined;
  const statusIndex = parts.findIndex((part) => METABOLITE_STATUS.test(part));
  const status = statusIndex >= 0 ? parts.splice(statusIndex, 1)[0].toLowerCase() : undefined;
  return { name: match[1].trim(), abbreviation, status, qualifications: parts, citationTokens };
}

function projectMetabolite(value, policy) {
  const display = projectMetaboliteDisplay(value);
  if (display.qualifications.length === 0) return null;
  const qualification = display.qualifications.join(", ");
  const start = value.indexOf(qualification);
  if (start < 0) return null;
  return { path: policy.path, role: policy.role, source: value, spans: [{ start, end: start + qualification.length, source: qualification }] };
}

/**
 * Nominates only safe reader-facing spans from a globally excluded scientific
 * leaf. Null means the normal corpus exclusion must win.
 */
export function nominateScientificSpans(pointer, value) {
  if (typeof value !== "string" || value.trim().length < 2) return null;
  const policy = resolveScientificFieldPolicy(pointer);
  if (!policy || policy.role === SCIENTIFIC_FIELD_ROLES.CANONICAL_IDENTIFIER) return null;
  if (policy.projector === "metabolite") return projectMetabolite(value, policy);
  if (policy.projector === "label") {
    return { path: policy.path, role: policy.role, source: value, spans: [{ start: 0, end: value.length, source: value }] };
  }
  return projectionFromProtectedRanges(value, policy, collectProtectedRanges(value, [CITATION_TOKEN, SOURCE_QUANTITY, SCIENTIFIC_ACRONYM]));
}

/** Restores translated safe spans into the untouched source leaf. */
export function restoreScientificSpans(projection, translatedSpans) {
  if (!projection || !Array.isArray(projection.spans) || translatedSpans.length !== projection.spans.length) {
    throw new TypeError("Scientific projection and translated span counts must match");
  }
  let restored = projection.source;
  for (let index = projection.spans.length - 1; index >= 0; index -= 1) {
    const span = projection.spans[index];
    const translated = translatedSpans[index];
    if (typeof translated !== "string" || translated.length === 0) throw new TypeError("Scientific translated spans must be non-empty strings");
    restored = `${restored.slice(0, span.start)}${translated}${restored.slice(span.end)}`;
  }
  return restored;
}
