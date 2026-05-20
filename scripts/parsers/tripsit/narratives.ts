import { cleanMarkdown, extractBulletList, extractSection } from "../base";

export function parseIntroductoryParagraphs(content: string): string | undefined {
  const firstHeaderMatch = content.match(/^([\s\S]*?)(?=\n##\s)/);
  if (!firstHeaderMatch) return undefined;

  const intro = cleanMarkdown(firstHeaderMatch[1]).trim();
  return intro.length > 100 && !intro.startsWith("#") && !intro.startsWith("*Source:")
    ? intro
    : undefined;
}

export function parseExternalLinksSection(content: string): string | undefined {
  const linksSection = extractSection(content, "External Links", 2);
  return linksSection && linksSection.length > 30 ? cleanMarkdown(linksSection) : undefined;
}

export function parseChemistryPharmacologySection(content: string): string | undefined {
  const section =
    extractSection(content, "Chemistry and Pharmacology", 2) ||
    extractSection(content, "Chemistry", 2) ||
    extractSection(content, "Pharmacology", 2);
  return section && section.length > 50 ? cleanMarkdown(section) : undefined;
}

export function parseAfterEffectsNarrative(content: string): string | undefined {
  const afterSection =
    extractSection(content, "After effects", 3) || extractSection(content, "After-effects", 3);
  return afterSection && afterSection.length > 50 ? cleanMarkdown(afterSection) : undefined;
}

export function parseHarmReductionProse(content: string): string | undefined {
  const harmSection = extractSection(content, "Harm Reduction", 2);
  if (!harmSection) return undefined;

  const firstBulletIndex = harmSection.search(/^[-*]\s/m);
  if (firstBulletIndex <= 0) return undefined;

  const prose = harmSection.slice(0, firstBulletIndex).trim();
  return prose.length > 50 ? cleanMarkdown(prose) : undefined;
}

export function parseWikiHarmReduction(content: string, sourceId: string) {
  const harmSection = extractSection(content, "Harm Reduction", 2);
  if (!harmSection) return undefined;

  const rules = extractBulletList(harmSection);
  return rules.length > 0
    ? {
        rules: rules.map(cleanMarkdown),
        sources: [sourceId],
      }
    : undefined;
}
