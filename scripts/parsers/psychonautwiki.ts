import type { ParserResult, SourceParser } from "./types";

import { createEmptyParserResult } from "./base";
import { parseDosageAndDuration } from "./psychonautwiki/routes";
import { parseSubjectiveEffects } from "./psychonautwiki/effects";
import { parseToxicitySection, parseTolerance } from "./psychonautwiki/safety";
import { parseLegalStatus } from "./psychonautwiki/legal";
import { parseChemistry, parsePharmacology } from "./psychonautwiki/structured";
import { collectPsychonautWikiNarratives } from "./psychonautwiki/narratives";
import { getParseableSourceDescriptor } from "./source-identity";

function pushExtractedSection(result: ParserResult, section: string) {
  if (!result.sectionsExtracted.includes(section)) {
    result.sectionsExtracted.push(section);
  }
}

class PsychonautWikiParser implements SourceParser {
  source = getParseableSourceDescriptor("psychonautwiki");
  sourceId = this.source.id;

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    const { dosage, duration } = parseDosageAndDuration(content, this.sourceId);
    result.dosage = dosage;
    result.duration = duration;
    result.effects = parseSubjectiveEffects(content, this.sourceId);

    const { interactions, harmReduction } = parseToxicitySection(content, this.sourceId);
    result.interactions = interactions;
    result.harmReduction = harmReduction;

    const legalResult = parseLegalStatus(content, this.sourceId);
    result.legal = legalResult.legal;
    result.internationalLaw = legalResult.internationalLaw;
    result.tolerance = parseTolerance(content, this.sourceId);
    result.chemistry = parseChemistry(content, this.sourceId);
    result.pharmacology = parsePharmacology(content, this.sourceId);

    if (result.dosage.length > 0) pushExtractedSection(result, "dosage");
    if (result.duration.length > 0) pushExtractedSection(result, "duration");
    if (result.effects.length > 0) pushExtractedSection(result, "effects");
    if (result.interactions.length > 0) pushExtractedSection(result, "interactions");
    if (result.legal.length > 0) pushExtractedSection(result, "legal");
    if (result.internationalLaw.length > 0) pushExtractedSection(result, "international_law");
    if (result.tolerance) pushExtractedSection(result, "tolerance");
    if (result.chemistry) pushExtractedSection(result, "chemistry");
    if (result.pharmacology) pushExtractedSection(result, "pharmacology");
    if (result.harmReduction) pushExtractedSection(result, "harm_reduction");

    for (const narrative of collectPsychonautWikiNarratives(content)) {
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
  }
}

export const psychonautWikiParser = new PsychonautWikiParser();
