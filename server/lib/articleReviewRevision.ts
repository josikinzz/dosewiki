import { contentHash } from "../../lib/proposals/contentHash";

export const ARTICLE_REVIEW_REVISION_RE = /^[a-f0-9]{96}$/;

const NON_CONTENT_FIELDS = new Set(["_id", "_creationTime", "editorial_review", "publicRevision"]);

export type MoleculeChemistry = Record<string, unknown> | null | undefined;

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

export function articleFingerprintOf(revision: string): string | null {
  return ARTICLE_REVIEW_REVISION_RE.test(revision) ? revision.slice(0, 64) : null;
}
