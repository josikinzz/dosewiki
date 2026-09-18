import type { ParsedChemistry, ParserResult, SourceParser } from "../types";
import { cleanMarkdown, createEmptyParserResult, parseDoseRange, parseDurationRange } from "../base";
import { getParseableSourceDescriptor } from "../source-identity";

export class IsomerDesignParser implements SourceParser {
  source = getParseableSourceDescriptor("isomerdesign");
  sourceId = this.source.id;

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();
    const chemistry: Partial<ParsedChemistry> = { sources: [this.sourceId] };
    const patterns: Array<{ pattern: RegExp; field: keyof ParsedChemistry }> = [
      { pattern: /\*\*IUPAC Name:\*\*\s*([^\n]+)/i, field: "iupac" },
      { pattern: /\*\*Molecular Formula:\*\*\s*([^\n]+)/i, field: "formula" },
      { pattern: /\*\*Molecular Weight:\*\*\s*([^\n]+)/i, field: "molecularWeight" },
      { pattern: /\*\*SMILES:\*\*\s*`?([^`\n]+)`?/i, field: "smiles" },
      { pattern: /\*\*InChI:\*\*\s*`?([^`\n]+)`?/i, field: "inchi" },
    ];

    for (const { pattern, field } of patterns) {
      const match = content.match(pattern);
      if (match && field !== "sources") {
        const value = match[1].trim();
        if (field === "iupac" && value.length < 5) {
          continue;
        }
        (chemistry as Record<string, unknown>)[field] = value;
      }
    }

    if (Object.keys(chemistry).length > 1) {
      result.chemistry = chemistry;
      result.sectionsExtracted.push("chemistry");
    }

    const synthesisMatch = content.match(/## SYNTHESIS([\s\S]*?)(?=##|$)/i);
    if (synthesisMatch) {
      result.narrativeContent.synthesis.push({
        source: this.sourceId,
        content: cleanMarkdown(synthesisMatch[1]),
      });
      result.sectionsExtracted.push("synthesis");
    }

    const commentsMatch = content.match(/## QUALITATIVE COMMENTS([\s\S]*?)(?=##|$)/i);
    if (commentsMatch) {
      result.narrativeContent.qualitativeComments.push({
        source: this.sourceId,
        content: cleanMarkdown(commentsMatch[1]),
      });
      result.sectionsExtracted.push("qualitative_comments");
    }

    const extensionsMatch = content.match(/## EXTENSIONS AND COMMENTARY([\s\S]*?)(?=##|$)/i);
    if (extensionsMatch) {
      const cleaned = cleanMarkdown(extensionsMatch[1]).trim();
      if (cleaned.length > 50) {
        result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "extensions_and_commentary",
          content: cleaned,
        });
        result.sectionsExtracted.push("extensions_commentary");
      }
    }

    const dosageMatch = content.match(/## DOSAGE\s*([\s\S]*?)(?=##|$)/i);
    if (dosageMatch) {
      const parsed = parseDoseRange(cleanMarkdown(dosageMatch[1]));
      if (parsed) {
        result.dosage.push({
          route: "Oral",
          source: this.sourceId,
          confidence: "medium",
          ranges: { common: parsed },
        });
        result.sectionsExtracted.push("dosage");
      }
    }

    const durationMatch = content.match(/## DURATION\s*([\s\S]*?)(?=##|$)/i);
    if (durationMatch) {
      const parsed = parseDurationRange(cleanMarkdown(durationMatch[1]));
      if (parsed) {
        result.duration.push({
          route: "Oral",
          source: this.sourceId,
          confidence: "medium",
          stages: { total: parsed },
        });
        result.sectionsExtracted.push("duration");
      }
    }

    return result;
  }
}

export const isomerDesignParser = new IsomerDesignParser();
