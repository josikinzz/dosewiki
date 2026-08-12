import type { ArticleBylineAuthor } from "@/features/articles/domain/articleByline";
import { formatArchiveDate } from "@/utils/archiveDate";
import { buildBlogPostExcerpt } from "./blogPostModel";

/**
 * A dose.wiki blog post — a `kind: "blog"` row of `effectIndexArticles`, written
 * in the /dev Blog tab.
 *
 * Deliberately a separate type from `BlogPostViewModel`, which models the frozen
 * Effect Index archive out of the `effectIndexArchive` table. The two never mix:
 * they come from different tables, render on different flavors, and a change to
 * one must not be able to reshape the other.
 */
export type WritingBlogPost = {
  slug: string;
  title: string;
  /** Editor-written standfirst. Falls back to a derived excerpt on the index. */
  teaser?: string;
  coverImageUrl?: string;
  dateLabel: string | null;
  dateTime: string | null;
  body: string;
  bylineAuthors: ArticleBylineAuthor[];
};

export function toWritingBlogPost(
  row: {
    slug: string;
    title: string;
    teaser?: string;
    coverImageUrl?: string;
    publicationDate?: string;
    body_raw: string;
  },
  bylineAuthors: ArticleBylineAuthor[] = [],
): WritingBlogPost {
  const dateLabel = formatArchiveDate(row.publicationDate);
  const teaser = row.teaser?.trim();

  return {
    slug: row.slug,
    title: row.title,
    teaser: teaser && teaser.length > 0 ? teaser : undefined,
    coverImageUrl: row.coverImageUrl?.trim() || undefined,
    dateLabel,
    dateTime: dateLabel ? row.publicationDate ?? null : null,
    body: row.body_raw,
    bylineAuthors,
  };
}

/** The card blurb: the editor's teaser when there is one, else a derived excerpt. */
export function writingBlogPostSummary(post: WritingBlogPost, maxLength = 220): string {
  return post.teaser ?? buildBlogPostExcerpt(post.body, maxLength);
}
