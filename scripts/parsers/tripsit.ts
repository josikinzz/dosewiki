import type { ParserResult, SourceParser } from "./types";

import { cleanMarkdown, createEmptyParserResult, extractSection } from "./base";
import { parseDosageSection, parseDurationSection } from "./tripsit/routes";
import { parseEffectsSection } from "./tripsit/effects";
import { parseInteractionsSection, parseToleranceSection } from "./tripsit/safety";
import { parseClassificationSection, parseSummarySection } from "./tripsit/meta";
import { getParseableSourceDescriptor } from "./source-identity";
import {
  parseAfterEffectsNarrative,
  parseChemistryPharmacologySection,
  parseExternalLinksSection,
  parseHarmReductionProse,
  parseIntroductoryParagraphs,
  parseWikiHarmReduction,
} from "./tripsit/narratives";

function pushExtractedSection(result: ParserResult, section: string) {
  if (!result.sectionsExtracted.includes(section)) {
    result.sectionsExtracted.push(section);
  }
}

function parseSharedTripSitContent(result: ParserResult, content: string, sourceId: string) {
  result.dosage = parseDosageSection(content, sourceId);
  result.duration = parseDurationSection(content, sourceId);
  result.effects = parseEffectsSection(content, sourceId);
  result.interactions = parseInteractionsSection(content, sourceId);
  result.tolerance = parseToleranceSection(content, sourceId);

  if (result.dosage.length > 0) pushExtractedSection(result, "dosage");
  if (result.duration.length > 0) pushExtractedSection(result, "duration");
  if (result.effects.length > 0) pushExtractedSection(result, "effects");
  if (result.interactions.length > 0) pushExtractedSection(result, "interactions");
  if (result.tolerance) pushExtractedSection(result, "tolerance");
}

class TripSitFactsheetsParser implements SourceParser {
  source = getParseableSourceDescriptor("tripsit-factsheets");
  sourceId = this.source.id;

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();
    parseSharedTripSitContent(result, content, this.sourceId);

    const classification = parseClassificationSection(content);
    if (classification.categories.length > 0 || classification.aliases.length > 0) {
      pushExtractedSection(result, "classification");
    }

    const summary = parseSummarySection(content);
    if (summary) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "summary",
        content: summary,
      });
      pushExtractedSection(result, "summary");
    }

    const externalLinks = parseExternalLinksSection(content);
    if (externalLinks) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "external_links",
        content: externalLinks,
      });
    }

    return result;
  }
}

class TripSitWikiParser implements SourceParser {
  source = getParseableSourceDescriptor("tripsit-wiki");
  sourceId = this.source.id;

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();
    parseSharedTripSitContent(result, content, this.sourceId);

    const intro = parseIntroductoryParagraphs(content);
    if (intro) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "introduction",
        content: intro,
      });
      pushExtractedSection(result, "introduction");
    }

    const historySection = extractSection(content, "History", 2);
    if (historySection) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "history",
        content: cleanMarkdown(historySection),
      });
      pushExtractedSection(result, "history");
    }

    const chemistryPharmacology = parseChemistryPharmacologySection(content);
    if (chemistryPharmacology) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "chemistry_pharmacology",
        content: chemistryPharmacology,
      });
      pushExtractedSection(result, "chemistry_pharmacology");
    }

    const afterEffects = parseAfterEffectsNarrative(content);
    if (afterEffects) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "after_effects",
        content: afterEffects,
      });
    }

    const harmReductionProse = parseHarmReductionProse(content);
    if (harmReductionProse) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "harm_reduction_overview",
        content: harmReductionProse,
      });
    }

    result.harmReduction = parseWikiHarmReduction(content, this.sourceId);
    if (result.harmReduction) {
      pushExtractedSection(result, "harm_reduction");
    }

    return result;
  }
}

export const tripsitFactsheetsParser = new TripSitFactsheetsParser();
export const tripsitWikiParser = new TripSitWikiParser();
