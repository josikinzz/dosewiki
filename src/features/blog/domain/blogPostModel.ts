import type { PublicEffectIndexPost } from "@/data/projections/effectIndexArchiveProjections";
import { formatArchiveDate } from "@/utils/archiveDate";

export type BlogPostViewModel = {
  slug: string;
  title: string;
  author: string;
  dateLabel: string | null;
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

export function buildBlogPostExcerpt(body: string, maxLength = 220): string {
  const firstParagraph = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block.length > 0);

  if (!firstParagraph) {
    return "";
  }

  const flattened = firstParagraph
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
