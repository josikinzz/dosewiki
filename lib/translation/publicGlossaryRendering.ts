import type { Rendering } from "../../src/features/language-glossary/languageGlossary";

/** One SQL snapshot shared by public pages and transactional feedback validation.
 * Select only public rendering fields, never reviewer identities or history.
 */
export const PUBLIC_GLOSSARY_RENDERING_SELECT = `SELECT g."term",
  COALESCE(r."draft"->>'context', g."kind") AS "kind",
  COALESCE(r."draft"->>'target', g."target") AS "target",
  CASE WHEN r."draft"->>'target' IS NOT NULL THEN 'draft' ELSE g."status" END AS "status",
  g."updated_at", COALESCE(r."revision", 0) AS "review_revision"
  FROM "translationGlossary" g LEFT JOIN "translationReviewEntries" r
    ON r."locale" = g."locale" AND r."scope" = 'glossary' AND r."source_id" = g."term"`;

export function publicGlossaryRendering(
  row: Record<string, unknown>,
): Rendering {
  return {
    term: String(row.term),
    kind: String(row.kind),
    target: String(row.target),
    status: row.status as "draft" | "approved",
    updated_at: Number(row.updated_at),
    review_revision: Number(row.review_revision ?? 0),
  };
}
