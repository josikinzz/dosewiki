/**
 * Pure reference normalization and collection operations.
 *
 * Contextual article publication uses the same identity and metadata rules as
 * reference intake. None of these helpers writes production independently:
 * prose, sources, revision guards and citation-evidence rechecks commit together
 * through the article lifecycle.
 */
import {
  findEquivalentReference,
  hasUnsafeReferenceMarkup,
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
  if (
    hasUnsafeReferenceMarkup(title)
    || hasUnsafeReferenceMarkup(reference.apaText)
  ) {
    return {
      ok: false,
      reason: "Source titles and citation text cannot contain raw MediaWiki or <ref> markup.",
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

export type RemoveArticleReferenceResult =
  | {
      ok: true;
      removed: true;
      /** The removed reference's bibliographic title, for changelog messages. */
      title: string | null;
      markersStripped: number;
      routeIdsStripped: number;
      /** Replacement values for every top-level key the removal changed. */
      patch: Record<string, unknown>;
    }
  | { ok: true; removed: false }
  | { ok: false; error: string };

/**
 * Keys whose subtrees hold citation metadata rather than prose, mirroring the
 * skip set in `collectCitationTextFields` (editorReferenceDiagnostics.ts).
 * A `[cite:...]` string under these keys is data about citations, not a marker.
 */
const MARKER_TRAVERSAL_SKIP_KEYS: Record<string, true> = {
  references: true,
  source_citations: true,
  citations: true,
  editorial_review: true,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes every `[cite:<id>]` marker for one id from a prose string, cleaning
 * the whitespace the marker occupied: no doubled spaces, no stray space left
 * before punctuation, no leading/trailing gap.
 */
function stripMarkersFromText(
  value: string,
  marker: RegExp,
): { value: string; count: number } {
  const matches = value.match(marker);
  if (!matches) return { value, count: 0 };
  const stripped = value
    .replace(marker, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
  return { value: stripped, count: matches.length };
}

/**
 * Walks every string leaf of the document (same generic traversal as
 * `collectCitationTextFields`) and strips the marker wherever it appears.
 * Untouched subtrees keep their identity so the caller can patch only the
 * top-level keys that actually changed.
 */
function stripMarkersDeep(
  value: unknown,
  marker: RegExp,
  seen: WeakSet<object>,
  counter: { count: number },
): unknown {
  if (typeof value === "string") {
    const stripped = stripMarkersFromText(value, marker);
    counter.count += stripped.count;
    return stripped.count > 0 ? stripped.value : value;
  }

  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = stripMarkersDeep(item, marker, seen, counter);
      if (result !== item) changed = true;
      return result;
    });
    return changed ? next : value;
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (MARKER_TRAVERSAL_SKIP_KEYS[key] === true) {
      next[key] = child;
      continue;
    }
    const result = stripMarkersDeep(child, marker, seen, counter);
    if (result !== child) changed = true;
    next[key] = result;
  }
  return changed ? next : value;
}

/**
 * Filters one reference id out of every `routes[*].reference_ids` array in a
 * dosage or duration section, preserving identity when nothing matched.
 */
function stripRouteReferenceIds(
  section: unknown,
  referenceId: string,
): { value: unknown; removed: number } {
  if (!section || typeof section !== "object" || Array.isArray(section)) {
    return { value: section, removed: 0 };
  }
  const routes = (section as Record<string, unknown>).routes;
  if (!Array.isArray(routes)) return { value: section, removed: 0 };

  let removed = 0;
  let changed = false;
  const nextRoutes = routes.map((route) => {
    if (!route || typeof route !== "object" || Array.isArray(route)) return route;
    const ids = (route as Record<string, unknown>).reference_ids;
    if (!Array.isArray(ids)) return route;
    const nextIds = ids.filter((id) => id !== referenceId);
    if (nextIds.length === ids.length) return route;
    removed += ids.length - nextIds.length;
    changed = true;
    return { ...(route as Record<string, unknown>), reference_ids: nextIds };
  });
  if (!changed) return { value: section, removed: 0 };
  return { value: { ...(section as Record<string, unknown>), routes: nextRoutes }, removed };
}

/**
 * Removes one reference from a stored article document atomically with its
 * usages: every inline `[cite:<id>]` marker in prose and every
 * `routes[*].reference_ids` entry in dosage and duration. Idempotent — an
 * absent id reports `removed: false` and touches nothing.
 *
 * `patch` carries only the top-level keys the removal changed, so the mutation
 * never writes an untouched section back over a concurrent edit.
 */
export function removeArticleReference(
  document: Record<string, unknown>,
  referenceId: string,
): RemoveArticleReferenceResult {
  if (!REFERENCE_ID_PATTERN.test(referenceId)) {
    return { ok: false, error: "That is not a usable citation id." };
  }

  const current = existingReferences(document);
  if (current === null) {
    return { ok: false, error: "This article's reference list is not a list." };
  }

  const target = current.find((reference) => reference?.id === referenceId);
  if (!target) return { ok: true, removed: false };

  const patch: Record<string, unknown> = {
    references: current.filter((reference) => reference !== target),
  };

  const marker = new RegExp(`[ \\t]*\\[cite:${escapeRegExp(referenceId)}\\]`, "g");
  const counter = { count: 0 };
  const seen = new WeakSet<object>();
  let routeIdsStripped = 0;

  for (const [key, child] of Object.entries(document)) {
    if (key === "_id" || key === "_creationTime" || MARKER_TRAVERSAL_SKIP_KEYS[key] === true) {
      continue;
    }
    let next = stripMarkersDeep(child, marker, seen, counter);
    if (key === "dosage" || key === "duration") {
      const routeResult = stripRouteReferenceIds(next, referenceId);
      routeIdsStripped += routeResult.removed;
      next = routeResult.value;
    }
    if (next !== child) patch[key] = next;
  }

  return {
    ok: true,
    removed: true,
    title: typeof target.title === "string" && target.title.length > 0 ? target.title : null,
    markersStripped: counter.count,
    routeIdsStripped,
    patch,
  };
}
