import type { ParsedHarmReduction } from "../types";

import { cleanMarkdown, extractBulletList } from "../base";

import { extractErowidNestedSubsection, extractErowidSubsection } from "./sections";

export function parseHarmSection(content: string, sourceId: string): ParsedHarmReduction | undefined {
  const problemsSection = extractErowidSubsection(content, "PROBLEMS");
  const healthSection = extractErowidSubsection(content, "Health");
  const section = problemsSection || healthSection;
  if (!section) return undefined;

  const harmReduction: ParsedHarmReduction = {
    rules: [],
    shortTermRisks: [],
    longTermRisks: [],
    contraindications: [],
    sources: [sourceId],
  };

  const contraSection = extractErowidNestedSubsection(section, "Contraindications");
  if (contraSection) {
    harmReduction.contraindications = extractBulletList(contraSection).map(cleanMarkdown);
  }

  const addictionSection = extractErowidNestedSubsection(section, "Addiction Potential");
  if (addictionSection) {
    harmReduction.shortTermRisks?.push(`Addiction potential: ${cleanMarkdown(addictionSection)}`);
  }

  const longTermSection = extractErowidNestedSubsection(section, "Long Term Health");
  if (longTermSection) {
    harmReduction.longTermRisks = extractBulletList(longTermSection).map(cleanMarkdown);
    if (harmReduction.longTermRisks.length === 0) {
      harmReduction.longTermRisks.push(cleanMarkdown(longTermSection));
    }
  }

  const deathSection = extractErowidNestedSubsection(section, "Risk of Death");
  if (deathSection && !deathSection.includes("Summary Needed")) {
    harmReduction.longTermRisks?.push(`Risk of death: ${cleanMarkdown(deathSection)}`);
  }

  const hasContent =
    (harmReduction.rules?.length ?? 0) > 0 ||
    (harmReduction.shortTermRisks?.length ?? 0) > 0 ||
    (harmReduction.longTermRisks?.length ?? 0) > 0 ||
    (harmReduction.contraindications?.length ?? 0) > 0;

  return hasContent ? harmReduction : undefined;
}
