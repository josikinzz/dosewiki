const COLLAPSED_LINE_COUNT = 3;
const MIN_LINES_TO_TRUNCATE = 6;
const CHARS_PER_LINE = 100;

const CODE_SEPARATORS = /[-‐-―]/;

function isCodeDesignation(text: string, index: number): boolean {
  if (index < 2) return false;
  if (!CODE_SEPARATORS.test(text.charAt(index - 1))) return false;
  return /[A-Za-z]/.test(text.charAt(index - 2));
}

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

export function needsTruncation(content: string): boolean {
  return estimateVisualLines(content) > MIN_LINES_TO_TRUNCATE;
}

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
