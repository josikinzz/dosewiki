/**
 * The size ceiling for a stored diff or change-log markdown body, shared by
 * the Next routes that receive it and the Postgres mutations that store it.
 * Truncation always yields a string within the ceiling, marker included, so a
 * clipped body is never refused by the mutation behind the route that clipped
 * it.
 */
export const DIFF_MARKDOWN_MAX_LENGTH = 500_000;

const TRUNCATION_MARKER = "\n\n... [Diff truncated - too large to store]";

export function truncateDiffMarkdown(markdown: string, maxLength = DIFF_MARKDOWN_MAX_LENGTH): string {
  if (markdown.length <= maxLength) {
    return markdown;
  }
  return `${markdown.slice(0, maxLength - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}
