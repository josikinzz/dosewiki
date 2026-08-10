import {
  normalizeDoi,
  normalizePmid,
  normalizeReferenceMetadataProvenance,
} from "../../lib/citations/referenceIdentity.mjs";
import type {
  Reference,
  ReferenceMetadataProvenanceEntry,
} from "../../src/schema/substance/shared";

const REFERENCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROVENANCE_KINDS = new Set(["inspected", "fetched", "cached", "imported"]);
const PROVENANCE_KEYS = new Set([
  "kind",
  "source",
  "provider",
  "retrievedAt",
  "artifactDigest",
  "fields",
]);
const MAX_PROVENANCE_ENTRIES = 32;
const MAX_PROVENANCE_FIELDS = 64;

export interface ExpectedReferenceProvenanceSnapshot {
  title: string;
  doi: string | null;
  pmid: string | null;
  authors: string[];
  metadataProvenance: ReferenceMetadataProvenanceEntry[] | null;
}

export type ApplyReferenceProvenanceRepairResult =
  | {
      ok: true;
      updated: boolean;
      reference: Reference;
      references?: Reference[];
    }
  | {
      ok: false;
      code:
        | "REFERENCE_WRITE_REJECTED"
        | "REFERENCE_NOT_FOUND"
        | "REFERENCE_DUPLICATE"
        | "REFERENCE_CONFLICT";
      reason: string;
    };

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJsonValue((value as Record<string, unknown>)[key])]),
  );
}

function stableJson(value: unknown): string | undefined {
  return JSON.stringify(stableJsonValue(value));
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function normalizeOptionalDoi(value: unknown): string | null {
  return typeof value === "string" ? normalizeDoi(value) || null : null;
}

function normalizeOptionalPmid(value: unknown): string | null {
  return typeof value === "string" ? normalizePmid(value) || null : null;
}

function isExactString(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value === value.trim();
}

function strictProvenance(value: unknown): ReferenceMetadataProvenanceEntry[] | null {
  if (!Array.isArray(value) || value.length > MAX_PROVENANCE_ENTRIES) return null;
  const identities = new Map<string, string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const entry = raw as Record<string, unknown>;
    if (Object.keys(entry).some((key) => !PROVENANCE_KEYS.has(key))) return null;
    if (typeof entry.kind !== "string" || !PROVENANCE_KINDS.has(entry.kind)) return null;
    if (!isExactString(entry.source, 128)) return null;
    for (const [key, maxLength] of [["provider", 128], ["retrievedAt", 64], ["artifactDigest", 128]] as const) {
      if (entry[key] !== undefined && !isExactString(entry[key], maxLength)) return null;
    }
    if (entry.fields !== undefined) {
      if (!Array.isArray(entry.fields) || entry.fields.length === 0 || entry.fields.length > MAX_PROVENANCE_FIELDS) return null;
      if (!entry.fields.every((field) => isExactString(field, 64))) return null;
      if (new Set(entry.fields).size !== entry.fields.length) return null;
    }
    const conflictIdentity = JSON.stringify([
      entry.source,
      entry.provider ?? null,
      entry.artifactDigest ?? null,
      Array.isArray(entry.fields) ? [...entry.fields].sort() : [],
    ]);
    const canonicalEntry = stableJson(entry) ?? "";
    const previous = identities.get(conflictIdentity);
    if (previous && previous !== canonicalEntry) return null;
    identities.set(conflictIdentity, canonicalEntry);
  }
  const normalized = normalizeReferenceMetadataProvenance(value);
  return normalized.length === value.length && sameJson(normalized, value)
    ? normalized
    : null;
}

function normalizedStoredProvenance(reference: Record<string, unknown>): ReferenceMetadataProvenanceEntry[] | null {
  if (!Object.prototype.hasOwnProperty.call(reference, "metadataProvenance")) return null;
  return strictProvenance(reference.metadataProvenance);
}

function authorsAreExact(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((author) => typeof author === "string" && author.length > 0);
}

function proposedRetainsExpected(
  expected: ReferenceMetadataProvenanceEntry[] | null,
  proposed: ReferenceMetadataProvenanceEntry[],
): boolean {
  if (!expected) return true;
  const proposedEntries = new Set(proposed.map((entry) => stableJson(entry)));
  return expected.every((entry) => proposedEntries.has(stableJson(entry)));
}

/**
 * Apply one provenance-only reference repair with an exact CAS snapshot.
 * Identity, authors, and existing provenance must remain unchanged; only the
 * selected reference's metadataProvenance field can be added or extended.
 */
export function applyReferenceProvenanceRepair(
  document: Record<string, unknown>,
  input: {
    referenceId: string;
    expected: ExpectedReferenceProvenanceSnapshot;
    proposedMetadataProvenance: unknown;
  },
): ApplyReferenceProvenanceRepairResult {
  if (!REFERENCE_ID_PATTERN.test(input.referenceId)) {
    return { ok: false, code: "REFERENCE_WRITE_REJECTED", reason: "The reference id is invalid." };
  }
  if (!input.expected
      || typeof input.expected.title !== "string"
      || !authorsAreExact(input.expected.authors)
      || (input.expected.metadataProvenance !== null && !strictProvenance(input.expected.metadataProvenance))) {
    return { ok: false, code: "REFERENCE_WRITE_REJECTED", reason: "The expected reference snapshot is invalid." };
  }
  const proposed = strictProvenance(input.proposedMetadataProvenance);
  if (!proposed || proposed.length === 0 || !proposedRetainsExpected(input.expected.metadataProvenance, proposed)) {
    return {
      ok: false,
      code: "REFERENCE_WRITE_REJECTED",
      reason: "Proposed metadata provenance is invalid, conflicting, or removes existing lineage.",
    };
  }
  if (!Array.isArray(document.references)) {
    return { ok: false, code: "REFERENCE_WRITE_REJECTED", reason: "This article's reference list is not a list." };
  }
  const references = document.references as Array<Record<string, unknown>>;
  const indexes = references.flatMap((reference, index) => reference?.id === input.referenceId ? [index] : []);
  if (indexes.length === 0) {
    return { ok: false, code: "REFERENCE_NOT_FOUND", reason: `Reference "${input.referenceId}" was not found.` };
  }
  if (indexes.length > 1) {
    return { ok: false, code: "REFERENCE_DUPLICATE", reason: `Reference id "${input.referenceId}" is duplicated.` };
  }
  const index = indexes[0];
  const reference = references[index];
  const identityMatches = reference.title === input.expected.title
    && normalizeOptionalDoi(reference.doi) === normalizeOptionalDoi(input.expected.doi)
    && normalizeOptionalPmid(reference.pmid) === normalizeOptionalPmid(input.expected.pmid);
  if (!identityMatches || !sameJson(reference.authors, input.expected.authors)) {
    return { ok: false, code: "REFERENCE_CONFLICT", reason: "The reference identity or authors changed after proposal generation." };
  }
  const liveProvenance = normalizedStoredProvenance(reference);
  const hasLiveField = Object.prototype.hasOwnProperty.call(reference, "metadataProvenance");
  if (hasLiveField && !liveProvenance) {
    return { ok: false, code: "REFERENCE_CONFLICT", reason: "The stored metadata provenance is invalid." };
  }
  if (sameJson(liveProvenance ?? null, proposed)) {
    return { ok: true, updated: false, reference: reference as unknown as Reference };
  }
  if (!sameJson(liveProvenance ?? null, input.expected.metadataProvenance)) {
    return { ok: false, code: "REFERENCE_CONFLICT", reason: "The metadata provenance changed after proposal generation." };
  }
  const updatedReference = { ...reference, metadataProvenance: proposed } as unknown as Reference;
  const updatedReferences = [...references] as unknown as Reference[];
  updatedReferences[index] = updatedReference;
  return { ok: true, updated: true, reference: updatedReference, references: updatedReferences };
}
