const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^()]*(?:\([^)]*\)[^()]*)*)\)/g;

export function extractSections(content: string, headerLevel: number = 2): Map<string, string> {
  const sections = new Map<string, string>();
  const headerPattern = new RegExp(`^${"#".repeat(headerLevel)}\\s+(.+)$`, "gm");
  const matches: { name: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headerPattern.exec(content)) !== null) {
    matches.push({
      name: match[1].trim(),
      start: match.index + match[0].length,
      end: content.length,
    });
  }

  for (let i = 0; i < matches.length - 1; i++) {
    matches[i].end = matches[i + 1].start - matches[i + 1].name.length - headerLevel - 2;
  }

  for (const section of matches) {
    sections.set(section.name.toLowerCase(), content.slice(section.start, section.end).trim());
  }

  return sections;
}

export function extractSection(content: string, sectionName: string, headerLevel: number = 2): string | undefined {
  return extractSections(content, headerLevel).get(sectionName.toLowerCase());
}

export function extractSubsections(sectionContent: string, subHeaderLevel: number = 3): Map<string, string> {
  return extractSections(sectionContent, subHeaderLevel);
}

export function extractBulletList(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.match(/^\s*[-*•]\s+(.+)$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

export function extractLabeledBullets(content: string): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];

  for (const line of content.split("\n")) {
    const boldWithColon = line.match(/^\s*[-*•]\s+\*\*([^*]+):\*\*\s*(.+)$/);
    if (boldWithColon) {
      items.push({ label: boldWithColon[1].trim(), value: boldWithColon[2].trim() });
      continue;
    }

    const boldWithoutColon = line.match(/^\s*[-*•]\s+\*\*([^*]+)\*\*:?\s*(.+)$/);
    if (boldWithoutColon) {
      items.push({ label: boldWithoutColon[1].trim(), value: boldWithoutColon[2].trim() });
      continue;
    }

    const plainLabel = line.match(/^\s*[-*•]\s+([^:]+):\s*(.+)$/);
    if (plainLabel) {
      items.push({ label: plainLabel[1].trim(), value: plainLabel[2].trim() });
      continue;
    }

    const italicLabel = line.match(/^\s*\*([^*]+)\*\s*:\s*(.+)$/);
    if (italicLabel) {
      items.push({ label: italicLabel[1].trim(), value: italicLabel[2].trim() });
    }
  }

  return items;
}

export function parseMarkdownTable(content: string): Array<Record<string, string>> {
  const lines = content.split("\n").filter((line) => line.includes("|"));
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split("|")
    .map((header) => header.trim())
    .filter((header) => header && !header.match(/^[-:]+$/));

  return lines.slice(2).map((line) => {
    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell !== "");

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header.toLowerCase()] = cells[index] || "";
    });
    return row;
  });
}

export function parseLabelValueTable(content: string): Array<[string, string]> {
  const results: Array<[string, string]> = [];

  for (const line of content.split("\n")) {
    if (/^\s*\|[\s-:|]+\|\s*$/.test(line) || !line.includes("|")) {
      continue;
    }

    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell !== "");

    if (cells.length >= 2) {
      const [label, value] = cells;
      if (label && value && !label.match(/^[-:]+$/) && !label.match(/^(category|dose|label|value)$/i)) {
        results.push([label, value]);
      }
    }
  }

  return results;
}

export function stripMarkdownLinks(text: string): string {
  return text.replace(MARKDOWN_LINK_PATTERN, "$1");
}

export function cleanMarkdown(text: string): string {
  return text
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(/\[([^\]]+)\]\([^)]*$/g, "$1")
    .replace(/\[([^\]]+)\](?!\()/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#+\s*/g, "")
    .replace(/^\[|\]$/g, "")
    .trim();
}

export function stripReferences(text: string): string {
  return text.replace(/\[\d+\]/g, "").trim();
}
