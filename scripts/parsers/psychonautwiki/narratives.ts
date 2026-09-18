import { cleanMarkdown, extractSection, stripReferences } from "../base";

function extractNarrativeParagraphs(section: string): string {
  const narrativeLines: string[] = [];

  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("|") ||
      trimmed === "" ||
      /^(SMILES|IUPAC|Formula|Weight|Bioavailability)[:\s]/i.test(trimmed)
    ) {
      continue;
    }

    if (trimmed.length > 20) {
      narrativeLines.push(trimmed);
    }
  }

  return narrativeLines.join("\n\n");
}

function parseChemistryNarrative(content: string): string | undefined {
  const section = extractSection(content, "Chemistry", 2);
  if (!section) return undefined;

  const narrative = extractNarrativeParagraphs(section);
  return narrative.length > 50 ? stripReferences(cleanMarkdown(narrative)) : undefined;
}

function parsePharmacologyNarrative(content: string): string | undefined {
  const section = extractSection(content, "Pharmacology", 2);
  if (!section) return undefined;

  const mainNarrative = extractNarrativeParagraphs(section);
  const subsectionNarratives: string[] = [];
  const subsectionMatches = section.match(/###\s*(.+)/g);

  if (subsectionMatches) {
    for (const match of subsectionMatches) {
      const subsectionName = match.replace(/^###\s*/, "").trim();
      const subsection = extractSection(section, subsectionName, 3);
      if (!subsection) continue;

      const subsectionNarrative = extractNarrativeParagraphs(subsection);
      if (subsectionNarrative.length > 50) {
        subsectionNarratives.push(`[${subsectionName}]\n${subsectionNarrative}`);
      }
    }
  }

  const combined = [mainNarrative, ...subsectionNarratives].filter(Boolean).join("\n\n");
  return combined.length > 50 ? stripReferences(cleanMarkdown(combined)) : undefined;
}

function parseFormsSection(content: string): string | undefined {
  const section = extractSection(content, "Forms", 2);
  if (!section) return undefined;
  const cleaned = stripReferences(cleanMarkdown(section));
  return cleaned.length > 50 ? cleaned : undefined;
}

function parseResearchSection(content: string): string | undefined {
  const section = extractSection(content, "Research", 2);
  if (!section) return undefined;
  const cleaned = stripReferences(cleanMarkdown(section));
  return cleaned.length > 50 ? cleaned : undefined;
}

function parseIntroductoryParagraphs(content: string): string | undefined {
  const dosageStart = content.indexOf("## Dosage & Duration");
  if (dosageStart === -1) return undefined;

  const fromDosage = content.slice(dosageStart);
  const nextSectionMatch = fromDosage.match(/\n## (?!Dosage)/);
  if (!nextSectionMatch) return undefined;

  const dosageSection = fromDosage.slice(0, nextSectionMatch.index);
  const durationEndPatterns = [
    /\*\*After effects:\*\*[^\n]+\n/gi,
    /- After effects:[^\n]+\n/gi,
    /\*\*Duration:\*\*[^\n]+\n/gi,
    /- Total:[^\n]+\n/gi,
  ];

  let lastStructuredEnd = 0;
  for (const pattern of durationEndPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(dosageSection)) !== null) {
      const end = match.index + match[0].length;
      if (end > lastStructuredEnd) lastStructuredEnd = end;
    }
  }

  if (lastStructuredEnd === 0) {
    const narrativeMatch = dosageSection.search(/\n\n\*\*[A-Z]|\n\n[A-Z][a-z]+ is a /);
    if (narrativeMatch > 0) lastStructuredEnd = narrativeMatch;
  }
  if (lastStructuredEnd === 0) return undefined;

  const cleaned = stripReferences(cleanMarkdown(dosageSection.slice(lastStructuredEnd).trim()));
  return cleaned.length > 100 ? cleaned : undefined;
}

function parseSubjectiveEffectsIntro(content: string): string | undefined {
  const section = extractSection(content, "Subjective effects", 2);
  if (!section) return undefined;

  const firstSubsection = section.indexOf("### ");
  if (firstSubsection === -1) return undefined;

  const narrative = extractNarrativeParagraphs(section.slice(0, firstSubsection));
  return narrative.length > 50 ? stripReferences(cleanMarkdown(narrative)) : undefined;
}

export interface PsychonautWikiNarrativeEntry {
  section: string;
  content: string;
  extractedSection?: string;
}

export function collectPsychonautWikiNarratives(content: string): PsychonautWikiNarrativeEntry[] {
  const narratives: PsychonautWikiNarrativeEntry[] = [];
  const historySection = extractSection(content, "History and culture", 2);
  if (historySection) {
    narratives.push({
      section: "history",
      content: stripReferences(cleanMarkdown(historySection)),
      extractedSection: "history",
    });
  }

  const entries: Array<{ section: string; content: string | undefined; extractedSection?: string }> = [
    { section: "introduction", content: parseIntroductoryParagraphs(content), extractedSection: "introduction" },
    { section: "chemistry", content: parseChemistryNarrative(content) },
    { section: "pharmacology", content: parsePharmacologyNarrative(content) },
    { section: "effects_overview", content: parseSubjectiveEffectsIntro(content) },
    { section: "forms", content: parseFormsSection(content), extractedSection: "forms" },
    { section: "research", content: parseResearchSection(content), extractedSection: "research" },
  ];

  for (const entry of entries) {
    if (entry.content) {
      narratives.push(entry as PsychonautWikiNarrativeEntry);
    }
  }

  return narratives;
}
