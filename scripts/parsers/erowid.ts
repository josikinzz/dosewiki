import type { ParserResult, SourceParser } from "./types";

import { createEmptyParserResult } from "./base";
import { parseDosageSection } from "./erowid/dosage";
import { parseDurationSection } from "./erowid/duration";
import { parseEffectsSection } from "./erowid/effects";
import { parseLegalSection } from "./erowid/legal";
import { parseHarmSection } from "./erowid/harm";
import { collectErowidNarratives } from "./erowid/narratives";
import { getParseableSourceDescriptor } from "./source-identity";

function pushExtractedSection(result: ParserResult, section: string) {
  if (!result.sectionsExtracted.includes(section)) {
    result.sectionsExtracted.push(section);
  }
}

class ErowidParser implements SourceParser { source = getParseableSourceDescriptor("erowid");
sourceId = this.source.id;

parse(content: string, _substanceName: string): ParserResult {
  const result = createEmptyParserResult();

  result.dosage = parseDosageSection(content, this.sourceId);
  result.duration = parseDurationSection(content, this.sourceId);
  result.effects = parseEffectsSection(content, this.sourceId);

  const legalResult = parseLegalSection(content, this.sourceId);
  result.legal = legalResult.legal;
  result.internationalLaw = legalResult.internationalLaw;
  result.harmReduction = parseHarmSection(content, this.sourceId);

  if (result.dosage.length > 0) pushExtractedSection(result, "dosage");
  if (result.duration.length > 0) pushExtractedSection(result, "duration");
  if (result.effects.length > 0) pushExtractedSection(result, "effects");
  if (result.legal.length > 0) pushExtractedSection(result, "legal");
  if (result.internationalLaw.length > 0) pushExtractedSection(result, "international_law");
  if (result.harmReduction) pushExtractedSection(result, "harm_reduction");

  for (const narrative of collectErowidNarratives(content)) {
    result.narrativeContent.generalNotes.push({
      source: this.sourceId,
      section: narrative.section,
      content: narrative.content,
    });

    if (narrative.extractedSection) {
      pushExtractedSection(result, narrative.extractedSection);
    }
  }

  return result;
} }

export const erowidParser = new ErowidParser();
