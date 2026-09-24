/**
 * The approved style guide as prompts read it. Kept apart from the review
 * mutations in styleGuide.ts so `loadTranslationContext` can load it without
 * importing the article reader.
 */
import "server-only";
import { createHash } from "node:crypto";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import type { ReviewEntry } from "./reviewTypes";
import { readStyleGuideSnapshot, STYLE_GUIDE_SOURCE_ID, type StyleGuide, type StyleGuideDocument } from "./styleGuideTypes";

/**
 * The prompt revision of a document: a digest of exactly what the prompt
 * reads (rules, and each example's id, English, before, after, why, and
 * time), so equal guides share a revision and an example's origin does not
 * count.
 */
export function styleGuideRevision(document: StyleGuideDocument): string {
  const printed = {
    rules: document.rules,
    examples: document.examples.map(({ id, source = "", before, after, why, addedAt }) => [id, source, before, after, why, addedAt]),
  };
  return createHash("sha256").update(JSON.stringify(printed)).digest("hex").slice(0, 16);
}

/** The approved guide of a stored entry; null when nothing with a rule or an example is approved. Drafts never count. */
export function approvedStyleGuide(entry: Pick<ReviewEntry, "approved"> | null | undefined): StyleGuide | null {
  const document = readStyleGuideSnapshot(entry?.approved?.target);
  if (!document || (document.rules.length === 0 && document.examples.length === 0)) return null;
  return { ...document, revision: styleGuideRevision(document) };
}

/** The approved guide every prompt for `locale` reads; null when none is approved. */
export async function loadApprovedStyleGuide(locale: string): Promise<StyleGuide | null> {
  const rows = await getPostgresClient().sql<{ approved: ReviewEntry["approved"] }>(
    'SELECT "approved" FROM "translationReviewEntries" WHERE "locale" = $1 AND "scope" = \'style-guide\' AND "source_id" = $2', [locale, STYLE_GUIDE_SOURCE_ID]);
  return approvedStyleGuide(rows[0] ?? null);
}
