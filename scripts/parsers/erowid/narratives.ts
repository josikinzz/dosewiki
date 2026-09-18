import { cleanMarkdown } from "../base";

import {
  extractErowidMarkdownSection,
  extractErowidNestedSubsection,
  extractErowidSubsection,
} from "./sections";

export interface ErowidNarrativeEntry {
  section: string;
  content: string;
  extractedSection?: string;
}

function readNarrativeSubsection(
  section: string | undefined,
  minimumLength: number,
): string | undefined {
  if (section && !section.includes("Summary Needed") && section.length > minimumLength) {
    return cleanMarkdown(section);
  }
  return undefined;
}

function parseMainDescription(content: string): string | undefined {
  const basicsSection = extractErowidMarkdownSection(content, "Basics");
  if (basicsSection) {
    const descSection = extractErowidSubsection(basicsSection, "DESCRIPTION");
    if (descSection && descSection.length > 50) {
      return cleanMarkdown(descSection);
    }
  }

  const descSection = extractErowidSubsection(content, "DESCRIPTION");
  if (descSection && descSection.length > 50) {
    return cleanMarkdown(descSection);
  }
  return undefined;
}

function parseEffectsDescriptionNarrative(content: string): string | undefined {
  const effectsSection = extractErowidMarkdownSection(content, "Effects");
  if (!effectsSection) return undefined;

  const descSection = extractErowidSubsection(effectsSection, "DESCRIPTION");
  if (descSection && descSection.length > 50) {
    return cleanMarkdown(descSection);
  }
  return undefined;
}

function parseProblemsNarrative(content: string): string | undefined {
  const problemsSection = extractErowidSubsection(content, "PROBLEMS");
  if (problemsSection && problemsSection.length > 100) {
    return cleanMarkdown(problemsSection);
  }
  return undefined;
}

function parseDosageDescriptionNarrative(content: string): string | undefined {
  const dosageSection = extractErowidMarkdownSection(content, "Dosage");
  if (!dosageSection) return undefined;

  const descSection = extractErowidSubsection(dosageSection, "DOSAGE DESCRIPTION");
  if (descSection && descSection.length > 50) {
    const prose = descSection.split(/\*\*[A-Za-z]+ (?:Oral )?Dosages\*\*/)[0];
    if (prose && prose.length > 50) {
      return cleanMarkdown(prose);
    }
  }
  return undefined;
}

export function collectErowidNarratives(content: string): ErowidNarrativeEntry[] {
  const narratives: ErowidNarrativeEntry[] = [];
  const entries: Array<{
    section: string;
    extractedSection?: string;
    content: string | undefined;
  }> = [
    {
      section: "description",
      extractedSection: "description",
      content: parseMainDescription(content),
    },
    {
      section: "chemistry",
      content: readNarrativeSubsection(extractErowidNestedSubsection(content, "Chemistry"), 30),
    },
    {
      section: "pharmacology",
      content: readNarrativeSubsection(extractErowidNestedSubsection(content, "Pharmacology"), 30),
    },
    {
      section: "production",
      content: readNarrativeSubsection(extractErowidNestedSubsection(content, "Production"), 30),
    },
    {
      section: "history",
      extractedSection: "history",
      content: readNarrativeSubsection(extractErowidNestedSubsection(content, "History"), 30),
    },
    {
      section: "effects_description",
      content: parseEffectsDescriptionNarrative(content),
    },
    {
      section: "harm_reduction_guidance",
      content: parseProblemsNarrative(content),
    },
    {
      section: "dosage_context",
      content: parseDosageDescriptionNarrative(content),
    },
    {
      section: "terminology",
      content: readNarrativeSubsection(
        extractErowidNestedSubsection(content, "Terminology / Slang") ||
          extractErowidNestedSubsection(content, "Terminology"),
        30,
      ),
    },
  ];

  for (const entry of entries) {
    if (entry.content) {
      narratives.push({
        section: entry.section,
        content: entry.content,
        extractedSection: entry.extractedSection,
      });
    }
  }

  return narratives;
}
