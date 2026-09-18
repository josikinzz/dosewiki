import type { ParsedEffect } from "../types";

import { cleanMarkdown, extractBulletList, extractSection } from "../base";

function validateEffectName(rawEffect: string): string | null {
  const effectName = cleanMarkdown(rawEffect).trim();
  if (!effectName || effectName.length < 3) return null;

  if (effectName.length > 100) {
    const truncated = effectName.split(/[.!?;]/)[0].trim();
    if (truncated.length >= 3 && truncated.length <= 80) {
      return truncated;
    }
    return null;
  }

  return effectName;
}

export function parseEffectsSection(content: string, sourceId: string): ParsedEffect[] {
  const effectsSection = extractSection(content, "Effects", 2);
  if (!effectsSection) return [];

  const effects: ParsedEffect[] = [];
  const positiveSection = extractSection(effectsSection, "Positive", 3);
  const neutralSection = extractSection(effectsSection, "Neutral", 3);
  const negativeSection = extractSection(effectsSection, "Negative", 3);

  for (const [section, category] of [
    [positiveSection, "positive"],
    [neutralSection, "neutral"],
    [negativeSection, "negative"],
  ] as const) {
    if (!section) continue;
    for (const effect of extractBulletList(section)) {
      const validName = validateEffectName(effect);
      if (validName) {
        effects.push({ name: validName, category, source: sourceId });
      }
    }
  }

  if (effects.length === 0) {
    for (const effect of extractBulletList(effectsSection)) {
      const validName = validateEffectName(effect);
      if (validName) effects.push({ name: validName, source: sourceId });
    }
  }

  return effects;
}
