export const DIFF_MARKDOWN_MAX_LENGTH = 500_000;

const TRUNCATION_MARKER = "\n\n... [Diff truncated - too large to store]";

export function truncateDiffMarkdown(markdown: string, maxLength = DIFF_MARKDOWN_MAX_LENGTH): string {
  if (markdown.length <= maxLength) {
    return markdown;
  }
  return `${markdown.slice(0, maxLength - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}
