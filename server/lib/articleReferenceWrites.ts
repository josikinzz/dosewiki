import {
  findEquivalentReference,
  hasUnsafeReferenceMarkup,
  haveCompatibleReferenceIdentity,
  mergeReferenceMetadata,
  referenceIdentitiesOverlap,
} from "../../lib/citations/referenceIdentity.mjs";
import { referenceSchema, type Reference } from "../../src/schema/substance/shared";

export const PORTAL_MINTED_REFERENCE_SUPPORT_STATUS = "needs_review" as const;

const REFERENCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const ARTICLE_REFERENCE_TITLE_MAX_LENGTH = 500;

export const ARTICLE_REFERENCE_URL_MAX_LENGTH = 2048;

export const ARTICLE_REFERENCE_MAX_AUTHORS = 100;

export const MAX_ARTICLE_REFERENCES = 1000;

export type AppendArticleReferenceResult =
  | {
      ok: true;
      created: boolean;
      reference: Reference;
      references?: Reference[];
    }
  | { ok: false; reason: string };

function existingReferences(document: Record<string, unknown>): Reference[] | null {
  const stored = document.references;
  if (stored === undefined || stored === null) return [];
  if (!Array.isArray(stored)) return null;
  return stored as Reference[];
}

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
      title: string | null;
      markersStripped: number;
      routeIdsStripped: number;
      patch: Record<string, unknown>;
    }
  | { ok: true; removed: false }
  | { ok: false; error: string };

const MARKER_TRAVERSAL_SKIP_KEYS: Record<string, true> = {
  references: true,
  source_citations: true,
  citations: true,
  editorial_review: true,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
