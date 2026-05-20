import { cleanMarkdown, extractLabeledBullets, extractSection } from "../base";

export interface ClassificationData {
  categories: string[];
  aliases: string[];
}

export function parseClassificationSection(content: string): ClassificationData {
  const classSection = extractSection(content, "Classification", 2);
  if (!classSection) return { categories: [], aliases: [] };

  const result: ClassificationData = { categories: [], aliases: [] };
  for (const bullet of extractLabeledBullets(classSection)) {
    const label = bullet.label.toLowerCase();
    if (label.includes("categories") || label.includes("category")) {
      result.categories = bullet.value.split(/[,;]/).map((value) => value.trim());
    } else if (label.includes("also known") || label.includes("aliases")) {
      result.aliases = bullet.value.split(/[,;]/).map((value) => value.trim());
    }
  }
  return result;
}

export function parseSummarySection(content: string): string | undefined {
  const summarySection = extractSection(content, "Summary", 2);
  return summarySection ? cleanMarkdown(summarySection) : undefined;
}
