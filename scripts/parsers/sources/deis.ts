import type {
  ParsedDosageRoute,
  ParsedDurationRoute,
  ParserResult,
  SourceParser,
} from "../types";
import {
  cleanMarkdown,
  createEmptyParserResult,
  extractBulletList,
  normalizeCountry,
  normalizeRoute,
  parseDoseRange,
  parseDurationRange,
} from "../base";
import { getParseableSourceDescriptor } from "../source-identity";

class DEISParser implements SourceParser {
  source = getParseableSourceDescriptor("disregardeverythingisay");
  sourceId = this.source.id;

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();
    const dosageRoutePattern =
      /Dosage\s*\(([^)]+)\)([\s\S]*?)(?=Dosage\s*\(|Duration|Click|Physical|Cognitive|Visual|$)/gi;

    let match: RegExpExecArray | null;
    while ((match = dosageRoutePattern.exec(content)) !== null) {
      const routeName = match[1].trim();
      const routeContent = match[2];
      const ranges = this.parseDoseLabels(routeContent);

      if (Object.keys(ranges).length > 0) {
        result.dosage.push({
          route: normalizeRoute(routeName),
          source: this.sourceId,
          confidence: "medium",
          ranges,
        });
      }
    }

    if (result.dosage.length === 0) {
      const topLevelMatch = content.match(/^[\s\S]*?(?=\*\*Physical|\*\*Cognitive|\*\*Visual|##|$)/i);
      if (topLevelMatch) {
        const ranges = this.parseDoseLabels(topLevelMatch[0]);
        if (Object.keys(ranges).length > 0) {
          result.dosage.push({
            route: "Oral",
            source: this.sourceId,
            confidence: "medium",
            ranges,
          });
        }
      }
    }

    if (result.dosage.length === 0) {
      const dosageSectionMatch = content.match(
        /\*\*Dosage:\*\*([\s\S]*?)(?=\*\*Physical|\*\*Cognitive|\n\n[A-Z]|$)/i,
      );
      if (dosageSectionMatch) {
        const ranges = this.parseDoseLabels(dosageSectionMatch[1]);
        if (Object.keys(ranges).length > 0) {
          result.dosage.push({
            route: "Oral",
            source: this.sourceId,
            confidence: "medium",
            ranges,
          });
        }
      }
    }

    if (result.dosage.length === 0) {
      const mgMatch = content.match(
        /\*\*Morning\s*Glory\s*Seeds?\*\*([\s\S]*?)(?=\*\*Hawaiian|\*\*Physical|$)/i,
      );
      if (mgMatch) {
        const ranges = this.parseDoseLabels(mgMatch[1]);
        if (Object.keys(ranges).length > 0) {
          result.dosage.push({
            route: "Oral",
            source: this.sourceId,
            confidence: "medium",
            ranges,
            notes: "Morning Glory Seeds",
          });
        }
      }

      const hbwrMatch = content.match(
        /\*\*Hawaiian\s*Baby\s*Woodrose\s*Seeds?\*\*([\s\S]*?)(?=\*\*Morning|\*\*Physical|$)/i,
      );
      if (hbwrMatch) {
        const ranges = this.parseDoseLabels(hbwrMatch[1]);
        if (Object.keys(ranges).length > 0) {
          result.dosage.push({
            route: "Oral",
            source: this.sourceId,
            confidence: "medium",
            ranges,
            notes: "Hawaiian Baby Woodrose Seeds",
          });
        }
      }
    }

    if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");

    const durationRoutePattern =
      /\*{0,2}Duration\s*\(([^)]+)\)\*{0,2}([\s\S]*?)(?=\*{0,2}Duration\s*\(|Dosage|Click|Physical|Cognitive|Visual|$)/gi;

    while ((match = durationRoutePattern.exec(content)) !== null) {
      const routeName = match[1].trim();
      const routeContent = match[2];
      const stages = this.parseDurationLabels(routeContent);

      if (Object.keys(stages).length > 0) {
        result.duration.push({
          route: normalizeRoute(routeName),
          source: this.sourceId,
          confidence: "medium",
          stages,
        });
      }
    }

    if (result.duration.length === 0) {
      const topLevelMatch = content.match(/^[\s\S]*?(?=\*\*Physical|\*\*Cognitive|\*\*Visual|##|$)/i);
      if (topLevelMatch) {
        const stages = this.parseDurationLabels(topLevelMatch[0]);
        if (Object.keys(stages).length > 0) {
          result.duration.push({
            route: result.dosage[0]?.route || "Oral",
            source: this.sourceId,
            confidence: "medium",
            stages,
          });
        }
      }
    }

    if (result.duration.length > 0) result.sectionsExtracted.push("duration");

    for (const sectionName of [
      "Physical effects",
      "Cognitive effects",
      "Visual effects",
      "Auditory effects",
    ]) {
      const sectionMatch = content.match(
        new RegExp(
          `\\*\\*${sectionName}:?\\*\\*([\\s\\S]*?)(?=\\*\\*(?:Physical|Cognitive|Visual|Auditory|Health|Legal)|$)`,
          "i",
        ),
      );
      if (sectionMatch) {
        const bullets = extractBulletList(sectionMatch[1]);
        for (const bullet of bullets) {
          const effectName = this.extractEffectName(bullet);
          if (effectName && effectName.length > 2) {
            result.effects.push({
              name: effectName,
              source: this.sourceId,
            });
          }
        }
      }
    }

    if (result.effects.length > 0) result.sectionsExtracted.push("effects");

    const legalMatch = content.match(/\*\*Legal (?:issues|status):?\*\*([\s\S]*?)(?=\*\*(?:Reader|Conclusion)|$)/i);
    if (legalMatch) {
      const bullets = extractBulletList(legalMatch[1]);
      for (const bullet of bullets) {
        const countryMatch = bullet.match(/^\*\*([^*]+)\*\*:?\s*(.+)/);
        if (countryMatch) {
          result.legal.push({
            country: normalizeCountry(countryMatch[1]),
            status: cleanMarkdown(countryMatch[2]),
            source: this.sourceId,
          });
        }
      }

      if (result.legal.length === 0) {
        for (const bullet of bullets) {
          const cleaned = cleanMarkdown(bullet);
          if (cleaned.includes("United States") || cleaned.includes("Schedule")) {
            result.legal.push({
              country: "United States",
              status: cleaned,
              source: this.sourceId,
            });
            break;
          }
        }
      }

      if (result.legal.length > 0) result.sectionsExtracted.push("legal");
    }

    const healthMatch = content.match(
      /\*\*Health\s+Effects?,?\s+(?:Potential\s+)?Addiction,?\s+and\s+Tolerance:?\*\*([\s\S]*?)(?=\*\*(?:Legal|Reader|Conclusion)|$)/i,
    );
    if (healthMatch) {
      const cleaned = cleanMarkdown(healthMatch[1]).trim();
      if (cleaned.length > 50) {
        result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "health_and_tolerance",
          content: cleaned,
        });
        result.sectionsExtracted.push("health_tolerance");
      }
    }

    const conclusionMatch = content.match(/\*\*Conclusion:?\*\*([\s\S]*?)$/i);
    if (conclusionMatch) {
      const cleaned = cleanMarkdown(conclusionMatch[1]).trim();
      if (cleaned.length > 50) {
        result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "conclusion",
          content: cleaned,
        });
        result.sectionsExtracted.push("conclusion");
      }
    }

    const tripReportsMatch = content.match(
      /\*\*Reader\s+submitted\s+trip\s+reports:?\*\*([\s\S]*?)(?=\*\*(?:Conclusion|Legal)|$)/i,
    );
    if (tripReportsMatch) {
      const cleaned = cleanMarkdown(tripReportsMatch[1]).trim();
      if (cleaned.length > 30) {
        result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "trip_reports",
          content: cleaned,
        });
        result.sectionsExtracted.push("trip_reports");
      }
    }

    let introMatch = content.match(
      /\*(?:Heavy|K[- ]?Hole)\*\s*:\s*[^\n]+\n\n([\s\S]*?)(?=\*\*(?:Physical|Cognitive|Visual|Auditory)\s+[Ee]ffects)/i,
    );

    if (!introMatch) {
      introMatch = content.match(
        /\*After effects\s*:?\*\s*[^\n]+\n\n([\s\S]*?)(?=\*\*(?:Physical|Cognitive|Visual|Auditory)\s+[Ee]ffects)/i,
      );
    }

    if (introMatch) {
      let introCleaned = cleanMarkdown(introMatch[1]).trim();
      introCleaned = introCleaned.replace(/^[\s\n]*image[\s\n]*/gi, "").trim();

      if (introCleaned.length > 100) {
        result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "overview",
          content: introCleaned,
        });
        result.sectionsExtracted.push("overview");
      }
    }

    return result;
  }

  private parseDoseLabels(content: string): ParsedDosageRoute["ranges"] {
    const ranges: ParsedDosageRoute["ranges"] = {};
    const labelPatterns = [
      { pattern: /\*\*?Threshold\s*:?\*\*?\s*:?\s*\*?([^\n*]+)/i, field: "threshold" },
      { pattern: /\*\*?Light\s*:?\*\*?\s*:?\s*\*?([^\n*]+)/i, field: "light" },
      { pattern: /\*\*?Common\s*:?\*\*?\s*:?\s*\*?([^\n*]+)/i, field: "common" },
      { pattern: /\*\*?Strong\s*:?\*\*?\s*:?\s*\*?([^\n*]+)/i, field: "strong" },
      { pattern: /\*\*?(?:Heavy|K[- ]?Hole)\s*:?\*\*?\s*:?\s*\*?([^\n*]+)/i, field: "heavy" },
    ];

    for (const { pattern, field } of labelPatterns) {
      const labelMatch = content.match(pattern);
      if (labelMatch) {
        let value = labelMatch[1].trim();
        if (value.includes("/")) {
          value = value.split("/")[0].trim();
        }
        value = value.replace(/\*+$/, "").trim();

        const parsed = parseDoseRange(value);
        if (parsed) {
          (ranges as Record<string, unknown>)[field] = parsed;
        }
      }
    }

    return ranges;
  }

  private parseDurationLabels(content: string): ParsedDurationRoute["stages"] {
    const stages: ParsedDurationRoute["stages"] = {};
    const stagePatterns = [
      { pattern: /\*?Onset\s*\*?\s*:\s*\*?\s*([^\n*]+)/i, field: "onset" },
      { pattern: /\*?Peak\s*\*?\s*:\s*\*?\s*([^\n*]+)/i, field: "peak" },
      { pattern: /\*?(?:Total\s+)?Duration\s*\*?\s*:\s*\*?\s*([^\n*]+)/i, field: "total" },
      { pattern: /\*?Come\s*up\s*\*?\s*:\s*\*?\s*([^\n*]+)/i, field: "comeUp" },
      { pattern: /\*?Come\s*down\s*\*?\s*:\s*\*?\s*([^\n*]+)/i, field: "offset" },
      {
        pattern:
          /\*?(?:After\s*Effects?|Normal\s+After\s+Effects?)\s*\*?\s*:\s*\*?\s*([^\n*]+)/i,
        field: "afterEffects",
      },
    ];

    for (const { pattern, field } of stagePatterns) {
      const stageMatch = content.match(pattern);
      if (stageMatch) {
        const parsed = parseDurationRange(stageMatch[1]);
        if (parsed) {
          (stages as Record<string, unknown>)[field] = parsed;
        }
      }
    }

    return stages;
  }

  private extractEffectName(bullet: string): string {
    const linkMatch = bullet.match(/\[([^\]]+)\]/);
    if (linkMatch) {
      return cleanMarkdown(linkMatch[1]);
    }

    const boldMatch = bullet.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      return cleanMarkdown(boldMatch[1]);
    }

    const incompleteBoldMatch = bullet.match(/^\*\*([^*]+)$/);
    if (incompleteBoldMatch) {
      return cleanMarkdown(incompleteBoldMatch[1]);
    }

    const descSeparator = bullet.indexOf(" - ");
    if (descSeparator > 0) {
      return cleanMarkdown(bullet.slice(0, descSeparator));
    }

    return cleanMarkdown(bullet.slice(0, 100));
  }
}

export const deiaParser = new DEISParser();
