import type { Rendering } from "../../src/features/language-glossary/languageGlossary";

/**
 * Whether a person checked the live wording, decided in SQL so the reviewer
 * never leaves the database: the newest recorded approval must carry these
 * exact bytes and name the actor the row names. Legacy metadata alone is not
 * proof (the rule `projectGlossaryReviewRows` applies in the workbench). A
 * pending draft or an unapproved row is a suggestion.
 */
const PROVENANCE = `CASE
    WHEN r."draft"->>'target' IS NOT NULL OR g."status" <> 'approved' THEN 'machine_suggestion'
    WHEN r."approved"->>'target' = g."target" AND (
      SELECT h."after_state"->'approved'->>'target' = g."target" AND h."actor" = g."reviewed_by"
      FROM "translationReviewHistory" h
      WHERE h."locale" = g."locale" AND h."scope" = 'glossary' AND h."source_id" = g."term" AND h."action" = 'approve'
      ORDER BY h."revision" DESC LIMIT 1
    ) THEN 'human_review'
    ELSE 'legacy_unverified'
  END`;

/** One SQL snapshot shared by public pages and transactional feedback validation.
 * Select only public rendering fields, never reviewer identities or history.
 */
export const PUBLIC_GLOSSARY_RENDERING_SELECT = `SELECT g."term",
  COALESCE(r."draft"->>'context', g."kind") AS "kind",
  COALESCE(r."draft"->>'target', g."target") AS "target",
  CASE WHEN r."draft"->>'target' IS NOT NULL THEN 'draft' ELSE g."status" END AS "status",
  ${PROVENANCE} AS "provenance",
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
    // Anything unrecognised reads as the weakest claim, never as checked.
    provenance:
      row.provenance === "human_review" ||
      row.provenance === "legacy_unverified"
        ? row.provenance
        : "machine_suggestion",
    updated_at: Number(row.updated_at),
    review_revision: Number(row.review_revision ?? 0),
  };
}
