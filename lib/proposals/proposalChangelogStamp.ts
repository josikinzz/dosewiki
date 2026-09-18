/**
 * The article stamps a change-proposal's changelog row carries.
 *
 * The commit panel sends `payload.changelog.articles` alongside the diff, but
 * a proposal submitted without that block (an API client, a draft whose diff
 * was assembled elsewhere) used to stamp an empty array. An entry with no
 * article stamps is invisible to `changelog:getByArticleSlug`, so the edit
 * never reaches the article's own history or the per-article /changes filter
 * even though the site-wide feed lists it. Production is read back after the
 * write instead, which is also how a new article gets the numeric id it only
 * received once the row existed.
 */

/** One article as the `changelog` table records it. */
export type ChangelogArticleStamp = { id: number; title: string; slug: string };

/** An article target as production reads back around the write. */
export type ProposalArticleRow = { slug: string; id?: number | null; title?: string | null };

/**
 * One stamp per article the proposal wrote, keyed by the target slug. Ids and
 * slugs come from production; a title missing there falls back to the payload's
 * and then to the slug. `0` marks a row that never received a numeric id, the
 * same placeholder the direct-edit history uses.
 */
export function proposalChangelogArticles(
  provided: readonly ChangelogArticleStamp[] | undefined,
  rows: readonly ProposalArticleRow[],
): ChangelogArticleStamp[] {
  if (rows.length === 0) {
    return provided ? [...provided] : [];
  }
  const bySlug = new Map((provided ?? []).map((stamp) => [stamp.slug, stamp]));
  return rows.map((row) => {
    const stamp = bySlug.get(row.slug);
    return {
      id: typeof row.id === "number" ? row.id : stamp?.id ?? 0,
      title: row.title?.trim() || stamp?.title || row.slug,
      slug: row.slug,
    };
  });
}
