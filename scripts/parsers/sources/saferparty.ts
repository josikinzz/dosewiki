import type { ParsedHarmReduction, ParserResult, SourceParser } from "../types";
import {
  cleanMarkdown,
  createEmptyParserResult,
  extractBulletList,
  extractSection,
} from "../base";
import { getParseableSourceDescriptor } from "../source-identity";

class SaferPartyParser implements SourceParser { source = getParseableSourceDescriptor("saferparty");
sourceId = this.source.id;

parse(content: string, _substanceName: string): ParserResult {
  const result = createEmptyParserResult();
  const effectsSection = extractSection(content, "Effects", 2);
  if (effectsSection) {
    const cleaned = cleanMarkdown(effectsSection).trim();
    if (cleaned.length > 20) {
      result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "effects",
        content: cleaned,
      });
      result.sectionsExtracted.push("effects_narrative");
    }
  }

  const harmReduction: Partial<ParsedHarmReduction> = {
    rules: [],
    shortTermRisks: [],
    longTermRisks: [],
    sources: [this.sourceId],
  };

  const shortTermSection = extractSection(content, "Short-term Risks", 3);
  if (shortTermSection) {
    harmReduction.shortTermRisks = [cleanMarkdown(shortTermSection)];
  }

  const longTermSection = extractSection(content, "Long-term Risks", 3);
  if (longTermSection) {
    harmReduction.longTermRisks = [cleanMarkdown(longTermSection)];
  }

  const saferUseSection = extractSection(content, "Safer Use", 2);
  if (saferUseSection) {
    harmReduction.rules = extractBulletList(saferUseSection).map(cleanMarkdown);
  }

  if (
    (harmReduction.rules?.length ?? 0) > 0 ||
    (harmReduction.shortTermRisks?.length ?? 0) > 0 ||
    (harmReduction.longTermRisks?.length ?? 0) > 0
  ) {
    result.harmReduction = harmReduction;
    result.sectionsExtracted.push("harm_reduction");
  }

  const dosageSection = extractSection(content, "Dosage", 2);
  if (dosageSection) {
    result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
    result.narrativeContent.generalNotes.push({
      source: this.sourceId,
      section: "dosage",
      content: cleanMarkdown(dosageSection),
    });
    result.sectionsExtracted.push("dosage_narrative");
  }

  const adulterantsSection = extractSection(content, "Adulterants & Extenders", 2);
  if (adulterantsSection) {
    const cleaned = cleanMarkdown(adulterantsSection).trim();
    if (cleaned.length > 50) {
      result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "adulterants",
        content: cleaned,
      });
      result.sectionsExtracted.push("adulterants");
    }
  }

  return result;
} }

export const saferPartyParser = new SaferPartyParser();
