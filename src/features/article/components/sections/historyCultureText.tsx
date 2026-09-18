/** Number of lines to show when collapsed */
const COLLAPSED_LINE_COUNT = 3;
/** Minimum lines before we bother truncating (if content is this short, just show it all) */
const MIN_LINES_TO_TRUNCATE = 6;
/** Approximate characters per line for truncation estimation */
const CHARS_PER_LINE = 100;

/** Hyphen-like characters that can join a code prefix to its number (ASCII plus the Unicode dash block) */
const CODE_SEPARATORS = /[-‐-―]/;

/**
 * True when the digits at `index` are the numeric half of a code designation such as
 * "EA-1298" or "JWH-018" rather than a year. Only a letter before the separator counts,
 * so digit ranges like "1960-1970" stay eligible.
 */
function isCodeDesignation(text: string, index: number): boolean {
  if (index < 2) return false;
  if (!CODE_SEPARATORS.test(text.charAt(index - 1))) return false;
  return /[A-Za-z]/.test(text.charAt(index - 2));
}

/** Renders text with 4-digit years automatically bolded (including decade forms like 1960s) */
export function renderWithBoldYears(text: string): React.ReactNode {
  const yearPattern = /\b((?:1\d{3}|20\d{2})s?)\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = yearPattern.exec(text)) !== null) {
    if (isCodeDesignation(text, match.index)) continue;

    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="theme-accent-emphasis font-semibold">
        {match[1]}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/** Estimates the number of visual lines content will take (accounting for wrapping) */
function estimateVisualLines(content: string): number {
  const paragraphs = content.split("\n");
  let totalLines = 0;

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      totalLines += 1;
    } else {
      totalLines += Math.ceil(paragraph.length / CHARS_PER_LINE);
    }
  }

  return totalLines;
}

/** Checks if content needs truncation (only if longer than 6 visual lines) */
export function needsTruncation(content: string): boolean {
  return estimateVisualLines(content) > MIN_LINES_TO_TRUNCATE;
}

/** Truncates content to approximately 3 visual lines, returns text ending cleanly at a word */
export function truncateContent(content: string): string {
  const paragraphs = content.split("\n");
  const resultParts: string[] = [];
  let linesUsed = 0;

  for (const paragraph of paragraphs) {
    if (linesUsed >= COLLAPSED_LINE_COUNT) break;

    if (paragraph.length === 0) {
      resultParts.push("");
      linesUsed += 1;
    } else {
      const paragraphVisualLines = Math.ceil(paragraph.length / CHARS_PER_LINE);
      const linesRemaining = COLLAPSED_LINE_COUNT - linesUsed;

      if (paragraphVisualLines <= linesRemaining) {
        resultParts.push(paragraph);
        linesUsed += paragraphVisualLines;
      } else {
        const charsToTake = linesRemaining * CHARS_PER_LINE;
        const truncated = paragraph.slice(0, charsToTake);
        const lastSpace = truncated.lastIndexOf(" ");
        resultParts.push(
          lastSpace > charsToTake * 0.7 ? truncated.slice(0, lastSpace) : truncated,
        );
        linesUsed = COLLAPSED_LINE_COUNT;
      }
    }
  }

  return resultParts.join("\n").trimEnd();
}
