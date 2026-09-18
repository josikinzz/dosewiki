import type { ParsedEffect } from "../types";

import { cleanMarkdown, extractBulletList } from "../base";

import { extractErowidMarkdownSection, extractErowidSubsection } from "./sections";

export function parseEffectsSection(content: string, sourceId: string): ParsedEffect[] {
  const effectsSection = extractErowidMarkdownSection(content, "Effects");
  if (!effectsSection) return [];

  const effects: ParsedEffect[] = [];
  const effectsListSection = extractErowidSubsection(effectsSection, "EFFECTS LIST");
  const targetSection = effectsListSection || effectsSection;
  const categories: Array<{ name: string; category: ParsedEffect["category"] }> = [
    { name: "POSITIVE", category: "positive" },
    { name: "NEUTRAL", category: "neutral" },
    { name: "NEGATIVE", category: "negative" },
  ];

  for (const { name, category } of categories) {
    const pattern = new RegExp(
      `${name}\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:POSITIVE|NEUTRAL|NEGATIVE)\\s*\\n|\\n[A-Z]+ #|$)`,
      "i",
    );
    const match = targetSection.match(pattern);
    if (!match) continue;

    for (const bullet of extractBulletList(match[1])) {
      const cleaned = cleanMarkdown(bullet).trim();
      if (cleaned.length > 2 && !cleaned.toLowerCase().includes("see below")) {
        effects.push({ name: cleaned, category, source: sourceId });
      }
    }
  }

  return effects;
}
