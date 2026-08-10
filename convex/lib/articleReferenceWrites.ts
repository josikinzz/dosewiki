/**
 * The validation and append rule behind `substanceIndex.appendArticleReference`,
 * the single-source write the review workbench's citation palette uses.
 *
 * Adding a source is not an inline field edit: `setArticleField` is scalar-only
 * by construction, and an array append does not fit it. It is also not a full
 * editor save — a reviewer who spots a missing citation mid-queue should be able
 * to mint the source and go on reading, without a diff or a commit message.
 *
 * The rule that makes that safe is idempotency by source identity. New ids are
 * deterministic, but older stored references may use another id for the same
 * DOI/PMID/ISBN/URL. Canonical identity matching keeps the stored marker id and
 * losslessly fills missing metadata without replacing populated canonical
 * fields. A double-click, a retry after a dropped response, and two reviewers
 * pasting the same source all converge on one
 * reference — which is why this write needs no optimistic-concurrency token the
 * way an inline edit does.
 *
 * Nothing here reads or writes Convex; the mutation supplies the document and
 * applies the patch, and the shared logic stays testable from plain Vitest.
 */
import {
  findEquivalentReference,
  haveCompatibleReferenceIdentity,
  mergeReferenceMetadata,
  referenceIdentitiesOverlap,
} from "../../lib/citations/referenceIdentity.mjs";
import { referenceSchema, type Reference } from "../../src/schema/substance/shared";

/**
 * Forced onto every reference a portal surface mints, whatever the client sent.
 *
 * A pasted identifier is a claim that a source exists, not evidence that anyone
 * read it against the sentence it will support. The citation workbench triages
 * on this field, so a portal-minted reference that arrived claiming `inspected`
 * would quietly leave that queue.
 */
export const PORTAL_MINTED_REFERENCE_SUPPORT_STATUS = "needs_review" as const;

/**
 * Ids must be addressable by a `[cite:...]` marker, so this is the marker
 * pattern from `referenceModel.ts` with a length bound. A reference whose id no
 * marker can name is unreachable content.
 */
const REFERENCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Titles are one line of bibliographic text, never prose. */
export const ARTICLE_REFERENCE_TITLE_MAX_LENGTH = 500;

/** Long enough for a real permalink, short enough to bound the document. */
export const ARTICLE_REFERENCE_URL_MAX_LENGTH = 2048;

export const ARTICLE_REFERENCE_MAX_AUTHORS = 100;

/**
 * Ceiling on one article's reference list. Well above the largest real article;
 * it exists so a scripted caller cannot grow a document without limit.
 */
export const MAX_ARTICLE_REFERENCES = 1000;

export type AppendArticleReferenceResult =
  | {
      ok: true;
      /** False when the same source identity was already present. */
      created: boolean;
      reference: Reference;
      /** The full replacement array when an append or metadata enrichment changed it. */
      references?: Reference[];
    }
  | { ok: false; reason: string };

function existingReferences(document: Record<string, unknown>): Reference[] | null {
  const stored = document.references;
  if (stored === undefined || stored === null) return [];
  if (!Array.isArray(stored)) return null;
  return stored as Reference[];
}

/**
 * Validates one incoming reference against the canonical schema and stamps the
 * fields the server owns.
 *
 * The Zod parse is also the sanitizer: it strips keys the schema does not name,
 * so a client cannot smuggle an unknown field into a stored document.
 */
export function normalizeIncomingReference(
  raw: unknown,
): { ok: true; reference: Reference } | { ok: false; reason: string } {
  const parsed = referenceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "That source is not a valid reference entry." };
  }

  const reference = parsed.data;

  if (!REFERENCE_ID_PATTERN.test(reference.id)) {
    return { ok: false, reason: "That source has no usable citation id." };
  }

  const title = reference.title.trim();
  if (title.length === 0) {
    return { ok: false, reason: "A source needs a title." };
  }
  if (title.length > ARTICLE_REFERENCE_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      reason: `A source title must be ${ARTICLE_REFERENCE_TITLE_MAX_LENGTH} characters or fewer.`,
    };
  }
  if ((reference.url?.length ?? 0) > ARTICLE_REFERENCE_URL_MAX_LENGTH) {
    return { ok: false, reason: "That source URL is too long to store." };
  }
  if (reference.authors.length > ARTICLE_REFERENCE_MAX_AUTHORS) {
    return {
      ok: false,
      reason: `A source may list at most ${ARTICLE_REFERENCE_MAX_AUTHORS} authors.`,
    };
  }

  return {
    ok: true,
    reference: {
      ...reference,
      title,
      supportStatus: PORTAL_MINTED_REFERENCE_SUPPORT_STATUS,
      metadataProvenance: [{
        kind: "imported",
        source: "portal-reference-intake",
        fields: Object.entries(reference)
          .filter(([field, value]) => field !== "id" && field !== "metadataProvenance" && value != null && value !== "")
          .map(([field]) => field)
          .slice(0, 64),
      }],
    },
  };
}

/**
 * Appends one reference to a stored article document, or reports that it is
 * already there.
 *
 * Only the `references` key is read and returned, so the mutation patches that
 * one key and never carries the rest of the document back over a concurrent
 * edit to another section.
 */
export function appendArticleReference(
  document: Record<string, unknown>,
  raw: unknown,
): AppendArticleReferenceResult {
  const normalized = normalizeIncomingReference(raw);
  if (normalized.ok === false) return normalized;

  const current = existingReferences(document);
  if (current === null) {
    return { ok: false, reason: "This article's reference list is not a list." };
  }

  // The stored marker id wins even when it predates deterministic ids. Matching
  // canonical source identity prevents a second id for the same DOI/PMID/URL/
  // ISBN — an alias the public renderer would deduplicate and leave dangling.
  const conflicting = current.find((reference) => (
    referenceIdentitiesOverlap(reference, normalized.reference)
    && !haveCompatibleReferenceIdentity(reference, normalized.reference)
  ));
  if (conflicting) {
    return {
      ok: false,
      reason: `Reference identity conflicts with stored reference ${conflicting.id}.`,
    };
  }

  const existing = findEquivalentReference(current, normalized.reference);
  if (existing) {
    const merged = mergeReferenceMetadata(existing, normalized.reference) as Reference;
    const changed = JSON.stringify(existing) !== JSON.stringify(merged);
    return {
      ok: true,
      created: false,
      reference: merged,
      ...(changed
        ? { references: current.map((reference) => reference === existing ? merged : reference) }
        : {}),
    };
  }

  if (current.length >= MAX_ARTICLE_REFERENCES) {
    return {
      ok: false,
      reason: `This article already lists the maximum of ${MAX_ARTICLE_REFERENCES} sources.`,
    };
  }

  return {
    ok: true,
    created: true,
    reference: normalized.reference,
    references: [...current, normalized.reference],
  };
}
