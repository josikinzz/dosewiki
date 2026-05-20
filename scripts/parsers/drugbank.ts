import type { ParserResult, SourceParser } from "./types";

import { createEmptyParserResult } from "./base";
import { parseChemicalInformation } from "./drugbank/chemistry";
import { parsePharmacologySection } from "./drugbank/pharmacology";
import { parseDrugInteractions, parseFoodInteractions } from "./drugbank/interactions";
import { parseOverviewNarrative } from "./drugbank/narratives";
import { getParseableSourceDescriptor } from "./source-identity";

function pushExtractedSection(result: ParserResult, section: string) {
  if (!result.sectionsExtracted.includes(section)) {
    result.sectionsExtracted.push(section);
  }
}

export class DrugBankParser implements SourceParser {
  source = getParseableSourceDescriptor("drugbank");
  sourceId = this.source.id;

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    result.chemistry = parseChemicalInformation(content, this.sourceId);
    result.pharmacology = parsePharmacologySection(content, this.sourceId);
    result.interactions = parseDrugInteractions(content, this.sourceId);
    result.narrativeContent.generalNotes = parseOverviewNarrative(content).map((note) => ({
      source: this.sourceId,
      section: note.section,
      content: note.content,
    }));

    const foodInteractions = parseFoodInteractions(content);
    if (foodInteractions.length > 0) {
      result.harmReduction = {
        rules: foodInteractions.map((item) => `Food interaction: ${item}`),
        sources: [this.sourceId],
      };
    }

    if (result.chemistry && Object.keys(result.chemistry).length > 1) pushExtractedSection(result, "chemistry");
    if (result.pharmacology && Object.keys(result.pharmacology).length > 1) pushExtractedSection(result, "pharmacology");
    if (result.interactions.length > 0) pushExtractedSection(result, "interactions");
    if (result.harmReduction) pushExtractedSection(result, "food_interactions");
    if (result.narrativeContent.generalNotes.length > 0) pushExtractedSection(result, "overview");

    return result;
  }
}

export const drugBankParser = new DrugBankParser();
