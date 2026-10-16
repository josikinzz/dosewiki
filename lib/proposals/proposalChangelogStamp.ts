export type ChangelogArticleStamp = { id: number; title: string; slug: string };

export type ProposalArticleRow = { slug: string; id?: number | null; title?: string | null };

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
