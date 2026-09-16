import type { PublicEffectIndexPost } from "@/data/projections/effectIndexArchiveProjections";
import { formatArchiveDate } from "@/utils/archiveDate";

/** One archived post as the blog surfaces render it. */
export type BlogPostViewModel = {
  slug: string;
  title: string;
  author: string;
  /** Human date, e.g. `30 January 2019`, or `null` when the archive carried no date. */
  dateLabel: string | null;
  /** `datetime` attribute value for `<time>`, or `null` alongside a null label. */
  dateTime: string | null;
  body: string;
};

export function toBlogPostViewModel(post: PublicEffectIndexPost): BlogPostViewModel {
  const dateLabel = formatArchiveDate(post.timestamp);

  return {
    slug: post.slug,
    title: post.title,
    author: post.author,
    dateLabel,
    dateTime: dateLabel ? post.timestamp : null,
    body: post.body,
  };
}

/**
 * First paragraph of a post body, trimmed to a preview length. The archive has no
 * summary field, so the index derives one rather than showing nothing under each title.
 */
export function buildBlogPostExcerpt(body: string, maxLength = 220): string {
  const firstParagraph = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block.length > 0);

  if (!firstParagraph) {
    return "";
  }

  const flattened = firstParagraph
    // Unwrap Markdown links to their label so the preview reads as prose.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (flattened.length <= maxLength) {
    return flattened;
  }

  const truncated = flattened.slice(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(" ");

  return `${(lastSpaceIndex > maxLength / 2 ? truncated.slice(0, lastSpaceIndex) : truncated).trimEnd()}…`;
}
