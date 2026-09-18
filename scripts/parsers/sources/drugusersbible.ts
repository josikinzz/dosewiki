import type { ParsedDurationRoute, ParserResult, SourceParser } from "../types";
import {
  cleanMarkdown,
  createEmptyParserResult,
  extractLabeledBullets,
  extractSection,
  parseDurationRange,
} from "../base";
import { getParseableSourceDescriptor } from "../source-identity";

class DrugUsersBibleParser implements SourceParser {
  source = getParseableSourceDescriptor("drugusersbible");
  sourceId = this.source.id;

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();
    const quickRefSection = extractSection(content, "Quick Reference", 2);
    if (quickRefSection) {
      const bullets = extractLabeledBullets(quickRefSection);
      let extractedRoute = "Oral";

      for (const bullet of bullets) {
        const label = bullet.label.toLowerCase();
        if (label === "roa" || label.includes("route")) {
          const roaValue = bullet.value.trim().toLowerCase();
          if (roaValue.includes("vapor") || roaValue.includes("smoke") || roaValue.includes("inhale")) {
            extractedRoute = "Inhalation";
          } else if (roaValue.includes("inject") || roaValue.includes("iv") || roaValue.includes("im")) {
            extractedRoute = "Injection";
          } else if (roaValue.includes("insuff") || roaValue.includes("snort") || roaValue.includes("nasal")) {
            extractedRoute = "Insufflated";
          } else if (roaValue.includes("sublingual") || roaValue.includes("buccal")) {
            extractedRoute = "Sublingual";
          } else if (roaValue.includes("rectal") || roaValue.includes("plug")) {
            extractedRoute = "Rectal";
          } else if (roaValue.includes("transdermal") || roaValue.includes("topical")) {
            extractedRoute = "Transdermal";
          } else if (roaValue.includes("oral") || roaValue.includes("swallow")) {
            extractedRoute = "Oral";
          }
          break;
        }
      }

      for (const bullet of bullets) {
        const label = bullet.label.toLowerCase();
        if (label.includes("onset") || label.includes("duration")) {
          const durationMatch = bullet.value.match(/(\d+)\s*(?:Seconds?|Minutes?|Hours?)/gi);
          if (durationMatch) {
            const stages: ParsedDurationRoute["stages"] = {};
            if (durationMatch[0]) {
              const parsed = parseDurationRange(durationMatch[0]);
              if (parsed) stages.onset = parsed;
            }
            if (durationMatch[1]) {
              const parsed = parseDurationRange(durationMatch[1]);
              if (parsed) stages.total = parsed;
            }

            if (Object.keys(stages).length > 0) {
              result.duration.push({
                route: extractedRoute,
                source: this.sourceId,
                confidence: "low",
                stages,
              });
            }
          }
        }
      }

      if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");
      if (result.duration.length > 0) result.sectionsExtracted.push("duration");
    }

    const experienceSection = extractSection(content, "Subjective Experience", 2);
    if (experienceSection) {
      result.narrativeContent.experienceReports.push({
        source: this.sourceId,
        content: cleanMarkdown(experienceSection),
      });
      result.sectionsExtracted.push("experience");
    }

    return result;
  }
}

export const drugUsersBibleParser = new DrugUsersBibleParser();
