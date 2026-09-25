import { contentHash } from "../../lib/proposals/contentHash";

/**
 * The revision a review sign-off covers, derived from what is stored rather
 * than from the revision journal, so every write path moves it: the lifecycle
 * publish, the staged batch save, inline field and IUPAC writes, generated
 * section publication, reference provenance, and anything added later.
 *
 * It is 96 hex characters: the article part (64) is the content hash of the
 * stored article without its storage identity and its review record, and the
 * molecule part (32) hashes the chemistry of the article's molecule override
 * (molblock, SMILES and bold bonds; an SVG re-render alone is not a chemistry
 * change). A sign-off, a flag or a note never moves it; any content write does.
 */
export const ARTICLE_REVIEW_REVISION_RE = /^[a-f0-9]{96}$/;

/** Fields that name storage or review state, never reviewed content. */
const NON_CONTENT_FIELDS = new Set(["_id", "_creationTime", "editorial_review", "publicRevision"]);

/** A `moleculeOverrides` row; only `molblock`, `smiles` and `boldBonds` are read. */
export type MoleculeChemistry = Record<string, unknown> | null | undefined;

/** Content hash of an article's reviewed content. Top-level null and absent read alike. */
export function articleContentFingerprint(article: Record<string, unknown>): string {
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(article)) {
    if (NON_CONTENT_FIELDS.has(key) || value === null || value === undefined) continue;
    content[key] = value;
  }
  return contentHash(content);
}

function moleculeFingerprint(molecule: MoleculeChemistry): string {
  const chemistry = molecule
    ? { molblock: molecule.molblock ?? null, smiles: molecule.smiles ?? null, boldBonds: molecule.boldBonds ?? null }
    : null;
  return contentHash({ molecule: chemistry }).slice(0, 32);
}

export function articleReviewRevision(article: Record<string, unknown>, molecule: MoleculeChemistry): string {
  return `${articleContentFingerprint(article)}${moleculeFingerprint(molecule)}`;
}

/** The article part of a derived revision, or null for a legacy journal hash or marker. */
export function articleFingerprintOf(revision: string): string | null {
  return ARTICLE_REVIEW_REVISION_RE.test(revision) ? revision.slice(0, 64) : null;
}
