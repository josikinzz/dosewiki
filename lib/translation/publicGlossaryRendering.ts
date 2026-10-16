import type { Rendering } from "../../src/features/language-glossary/languageGlossary";

const LIVE = `g."status" = 'approved'`;
const PROVENANCE = `CASE
    WHEN NOT (${LIVE}) THEN 'machine_suggestion'
    WHEN r."approved"->>'target' = g."target" AND (
      SELECT h."after_state"->'approved'->>'target' = g."target" AND h."actor" = g."reviewed_by"
      FROM "translationReviewHistory" h
      WHERE h."locale" = g."locale" AND h."scope" = 'glossary' AND h."source_id" = g."term" AND h."action" = 'approve'
      ORDER BY h."revision" DESC LIMIT 1
    ) THEN 'human_review'
    ELSE 'legacy_unverified'
  END`;

export const PUBLIC_GLOSSARY_RENDERING_SELECT = `SELECT g."term",
  CASE WHEN ${LIVE} THEN g."kind" ELSE COALESCE(r."draft"->>'context', g."kind") END AS "kind",
  CASE WHEN ${LIVE} THEN g."target" ELSE COALESCE(r."draft"->>'target', g."target") END AS "target",
  CASE WHEN ${LIVE} THEN 'approved' WHEN r."draft"->>'target' IS NOT NULL THEN 'draft' ELSE g."status" END AS "status",
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
    provenance:
      row.provenance === "human_review" ||
      row.provenance === "legacy_unverified"
        ? row.provenance
        : "machine_suggestion",
    updated_at: Number(row.updated_at),
    review_revision: Number(row.review_revision ?? 0),
  };
}
