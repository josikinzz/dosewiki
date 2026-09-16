import { normalizeDoi, normalizePmid } from "../../lib/citations/referenceIdentity.mjs";
import type { Reference } from "../../src/schema/substance/shared";

const REFERENCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const ARTICLE_REFERENCE_AUTHOR_MAX_COUNT = 100;
export const ARTICLE_REFERENCE_AUTHOR_MAX_LENGTH = 200;

export interface ExpectedReferenceAuthorSnapshot {
  title: string;
  doi: string | null;
  pmid: string | null;
  authors: string[];
}

export type ApplyReferenceAuthorRepairResult =
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

export type SelectUniqueArticleForReferenceAuthorRepairResult<T> =
  | { ok: true; article: T }
  | {
      ok: false;
      code: "ARTICLE_NOT_FOUND" | "ARTICLE_DUPLICATE";
      reason: string;
    };

/**
 * Resolve the bounded result of a slug-index lookup without trusting the index
 * to be unique. Callers query at most two rows; zero and duplicate matches fail
 * closed before any reference-level CAS logic can run.
 */
export function selectUniqueArticleForReferenceAuthorRepair<T>(
  articles: readonly T[],
  slug: string,
): SelectUniqueArticleForReferenceAuthorRepairResult<T> {
  if (articles.length === 0) {
    return {
      ok: false,
      code: "ARTICLE_NOT_FOUND",
      reason: `No substance found for slug "${slug}".`,
    };
  }
  if (articles.length > 1) {
    return {
      ok: false,
      code: "ARTICLE_DUPLICATE",
      reason: `Multiple substances found for slug "${slug}".`,
    };
  }
  return { ok: true, article: articles[0] };
}

function normalizeAuthors(raw: unknown, { allowEmpty }: { allowEmpty: boolean }): string[] | null {
  if (!Array.isArray(raw) || raw.length > ARTICLE_REFERENCE_AUTHOR_MAX_COUNT) return null;
  const seen = new Set<string>();
  const authors: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") return null;
    const author = value.replace(/\s+/g, " ").trim();
    if (!author || author.length > ARTICLE_REFERENCE_AUTHOR_MAX_LENGTH) return null;
    const key = author.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    authors.push(author);
  }
  if (!allowEmpty && authors.length === 0) return null;
  return authors;
}

function authorsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((author, index) => author === right[index]);
}

function normalizeOptionalDoi(value: unknown): string | null {
  return typeof value === "string" ? normalizeDoi(value) || null : null;
}

function normalizeOptionalPmid(value: unknown): string | null {
  return typeof value === "string" ? normalizePmid(value) || null : null;
}

function hasExpectedIdentity(
  reference: Record<string, unknown>,
  expected: ExpectedReferenceAuthorSnapshot,
): boolean {
  return reference.title === expected.title
    && normalizeOptionalDoi(reference.doi) === normalizeOptionalDoi(expected.doi)
    && normalizeOptionalPmid(reference.pmid) === normalizeOptionalPmid(expected.pmid);
}

/**
 * Apply one reviewed authors-only repair to one stored article snapshot.
 *
 * The mutation supplies the document and persists only the returned `references`
 * array. Identity fields plus the exact expected author list form the bounded CAS
 * guard. An already-applied proposal is idempotent, but any other divergence is
 * refused rather than merged silently.
 */
export function applyReferenceAuthorRepair(
  document: Record<string, unknown>,
  input: {
    referenceId: string;
    expected: ExpectedReferenceAuthorSnapshot;
    proposedAuthors: unknown;
  },
): ApplyReferenceAuthorRepairResult {
  if (!REFERENCE_ID_PATTERN.test(input.referenceId)) {
    return { ok: false, code: "REFERENCE_WRITE_REJECTED", reason: "The reference id is invalid." };
  }
  if (!input.expected || typeof input.expected.title !== "string" || !Array.isArray(input.expected.authors)) {
    return { ok: false, code: "REFERENCE_WRITE_REJECTED", reason: "The expected reference snapshot is invalid." };
  }
  const expectedAuthors = normalizeAuthors(input.expected.authors, { allowEmpty: true });
  const proposedAuthors = normalizeAuthors(input.proposedAuthors, { allowEmpty: false });
  if (!expectedAuthors || !proposedAuthors) {
    return {
      ok: false,
      code: "REFERENCE_WRITE_REJECTED",
      reason: `Authors must contain 1–${ARTICLE_REFERENCE_AUTHOR_MAX_COUNT} unique names of at most ${ARTICLE_REFERENCE_AUTHOR_MAX_LENGTH} characters.`,
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
  if (!hasExpectedIdentity(reference, input.expected)) {
    return { ok: false, code: "REFERENCE_CONFLICT", reason: "The reference identity changed after the proposal was generated." };
  }
  const liveAuthors = normalizeAuthors(reference.authors ?? [], { allowEmpty: true });
  if (!liveAuthors) {
    return { ok: false, code: "REFERENCE_CONFLICT", reason: "The stored author list is invalid or changed." };
  }
  if (authorsEqual(liveAuthors, proposedAuthors)) {
    return { ok: true, updated: false, reference: reference as unknown as Reference };
  }
  if (!authorsEqual(liveAuthors, expectedAuthors)) {
    return { ok: false, code: "REFERENCE_CONFLICT", reason: "The reference authors changed after the proposal was generated." };
  }
  const updatedReference = { ...reference, authors: proposedAuthors } as unknown as Reference;
  const updatedReferences = [...references] as unknown as Reference[];
  updatedReferences[index] = updatedReference;
  return { ok: true, updated: true, reference: updatedReference, references: updatedReferences };
}
