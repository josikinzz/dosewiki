import type {
  ParsedChemistry,
  ParsedDosageRoute,
  ParsedDurationRoute,
  ParserResult,
  SourceParser,
} from "../types";
import {
  cleanMarkdown,
  createEmptyParserResult,
  extractBulletList,
  extractSection,
  extractStatusAndNotes,
  normalizeRoute,
  normalizeCountry,
  parseDoseRange,
  parseDurationRange,
  stripReferences,
} from "../base";
import { getParseableSourceDescriptor } from "../source-identity";

class DrugClassroomParser implements SourceParser {
  source = getParseableSourceDescriptor("thedrugclassroom");
  sourceId = this.source.id;

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();
    let doseSection = extractSection(content, "Dose", 2);
    if (!doseSection) {
      doseSection = extractSection(content, "ROAs and Dose", 2);
    }
    if (!doseSection) {
      const section1Match = content.match(/#\s*Section\s*1[:\s]+Routes.*?Dose([\s\S]*?)(?=#\s*Section\s*2|$)/i);
      if (section1Match) {
        doseSection = section1Match[1];
      }
    }

    if (doseSection) {
      const extractDoseRanges = (routeContent: string): ParsedDosageRoute["ranges"] => {
        const ranges: ParsedDosageRoute["ranges"] = {};
        const labelPatterns = [
          { pattern: /-?\s*Light[:\s]+([^\n]+)/i, field: "light" },
          { pattern: /-?\s*Common[:\s]+([^\n]+)/i, field: "common" },
          { pattern: /-?\s*Strong[:\s]+([^\n]+)/i, field: "strong" },
          { pattern: /-?\s*Threshold[:\s]+([^\n]+)/i, field: "threshold" },
          { pattern: /-?\s*Heavy[:\s]+([^\n]+)/i, field: "heavy" },
          { pattern: /Initial[:\s]+([^\n]+)/i, field: "light" },
          { pattern: /Maintenance[:\s]+([^\n]+)/i, field: "common" },
          { pattern: /(?:Total\s+)?Range[:\s]+([^\n]+)/i, field: "common" },
          { pattern: /Most\s+common\s+range[:\s]+([^\n]+)/i, field: "common" },
          { pattern: /Total[:\s]+([^\n]+)/i, field: "common" },
          { pattern: /-\s*(?:Schizophrenia|Bipolar[^:]*|Depression)[:\s]+([^\n]+)/i, field: "common" },
          { pattern: /(?:SR|IR|XR|XL)[:\s]+(\d+(?:\s*(?:and|,)\s*\d+)*\s*mg)/i, field: "common" },
          { pattern: /was\s+([\d.]+\s*(?:to|–|-)\s*[\d.]+\s*mg(?:\/d)?)/i, field: "common" },
        ];

        for (const { pattern, field } of labelPatterns) {
          const labelMatch = routeContent.match(pattern);
          if (labelMatch) {
            const parsed = parseDoseRange(labelMatch[1]);
            if (parsed) {
              (ranges as Record<string, unknown>)[field] = parsed;
            }
          }
        }

        return ranges;
      };

      const cleanRouteName = (routeName: string) => routeName.replace(/\s*\([^)]+\)\s*/g, "").trim();
      let foundRoutes = false;
      const h4RoutePattern = /####\s*([^\n]+)([\s\S]*?)(?=####|##|$)/gi;
      let match: RegExpExecArray | null;

      while ((match = h4RoutePattern.exec(doseSection)) !== null) {
        const routeName = cleanRouteName(match[1].trim());
        const routeContent = match[2];
        const ranges = extractDoseRanges(routeContent);

        if (Object.keys(ranges).length > 0) {
          foundRoutes = true;
          result.dosage.push({
            route: normalizeRoute(routeName),
            source: this.sourceId,
            confidence: "medium",
            ranges,
          });
        }
      }

      if (!foundRoutes) {
        const boldRoutePattern =
          /\*\*([A-Za-z]+(?:\s*\([^)]+\))?)\*\*\s*\n([\s\S]*?)(?=\*\*[A-Za-z]+|## |---|\n\n[A-Z]|$)/gi;
        while ((match = boldRoutePattern.exec(doseSection)) !== null) {
          const routeName = cleanRouteName(match[1].trim());
          if (
            [
              "dose",
              "doses",
              "timeline",
              "note",
              "warning",
              "caution",
              "importance",
              "comfort",
              "forms",
              "maximum",
              "recreational",
              "medical",
            ].includes(routeName.toLowerCase())
          )
            continue;

          const ranges = extractDoseRanges(match[2]);
          if (Object.keys(ranges).length > 0) {
            foundRoutes = true;
            result.dosage.push({
              route: normalizeRoute(routeName),
              source: this.sourceId,
              confidence: "medium",
              ranges,
            });
          }
        }
      }

      if (!foundRoutes) {
        const plainRoutePattern =
          /^((?:Oral|Intranasal|Inhalation|Insufflated|IV|IM|Rectal|Sublingual|Smoked|Vaporized|Vapourized|Transdermal)(?:\s*\([^)]+\))?)\s*$/im;
        const lines = doseSection.split("\n");
        let currentRoute = "Oral";
        let currentContent = "";
        let anyRouteMatched = false;

        for (const line of lines) {
          const routeMatch = line.match(plainRoutePattern);
          if (routeMatch && routeMatch[1]) {
            anyRouteMatched = true;
            if (currentContent) {
              const ranges = extractDoseRanges(currentContent);
              if (Object.keys(ranges).length > 0) {
                foundRoutes = true;
                result.dosage.push({
                  route: normalizeRoute(cleanRouteName(currentRoute)),
                  source: this.sourceId,
                  confidence: "medium",
                  ranges,
                });
              }
            }
            currentRoute = routeMatch[1];
            currentContent = "";
          } else {
            currentContent += `${line}\n`;
          }
        }

        if (anyRouteMatched && currentContent) {
          const ranges = extractDoseRanges(currentContent);
          if (Object.keys(ranges).length > 0) {
            foundRoutes = true;
            result.dosage.push({
              route: normalizeRoute(cleanRouteName(currentRoute)),
              source: this.sourceId,
              confidence: "medium",
              ranges,
            });
          }
        }
      }

      if (!foundRoutes) {
        const h3RoutePattern = /(?<!#)###\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*\n([\s\S]*?)(?=(?<!#)###|##|$)/gi;
        while ((match = h3RoutePattern.exec(doseSection)) !== null) {
          const routeName = cleanRouteName(match[1].trim());
          const doseSubsectionMatch = match[2].match(/\*\*Doses?\*\*\s*\n([\s\S]*?)(?=\*\*Timeline\*\*|\*\*[A-Z]|$)/i);
          if (doseSubsectionMatch) {
            const ranges = extractDoseRanges(doseSubsectionMatch[1]);
            if (Object.keys(ranges).length > 0) {
              foundRoutes = true;
              result.dosage.push({
                route: normalizeRoute(routeName),
                source: this.sourceId,
                confidence: "medium",
                ranges,
              });
            }
          }
        }
      }

      if (!foundRoutes) {
        const ranges = extractDoseRanges(doseSection);
        if (Object.keys(ranges).length > 0) {
          result.dosage.push({
            route: "Oral",
            source: this.sourceId,
            confidence: "low",
            ranges,
          });
        }
      }

      if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");
    }

    let timelineSection = extractSection(content, "Timeline", 2);
    if (!timelineSection) timelineSection = extractSection(content, "ROAs and Timeline", 2);
    if (!timelineSection) {
      const boldMatch = content.match(/\*\*Timeline\*\*([\s\S]*?)(?=\n\*\*[A-Z][a-z]+\*\*\s*\n(?!Total|Onset)|## |$)/i);
      if (boldMatch) timelineSection = boldMatch[1];
    }

    if (timelineSection) {
      const cleanRouteName = (routeName: string) => routeName.replace(/\s*\([^)]+\)\s*/g, "").trim();
      let routePattern = /####\s*([^\n]+)([\s\S]*?)(?=####|##|$)/gi;
      let match: RegExpExecArray | null;
      let foundRoutes = false;

      while ((match = routePattern.exec(timelineSection)) !== null) {
        foundRoutes = true;
        const stages = this.parseTimelineStages(match[2]);
        if (Object.keys(stages).length > 0) {
          result.duration.push({
            route: normalizeRoute(cleanRouteName(match[1].trim())),
            source: this.sourceId,
            confidence: "medium",
            stages,
          });
        }
      }

      if (!foundRoutes) {
        routePattern =
          /\*\*([A-Za-z]+(?:\s*\([^)]+\))?)\*\*\s*\n([\s\S]*?)(?=\*\*[A-Za-z]+|## |---|\n\n[A-Z]|$)/gi;
        while ((match = routePattern.exec(timelineSection)) !== null) {
          const routeName = cleanRouteName(match[1].trim());
          if (["timeline", "note", "warning", "caution"].includes(routeName.toLowerCase())) continue;
          foundRoutes = true;
          const stages = this.parseTimelineStages(match[2]);
          if (Object.keys(stages).length > 0) {
            result.duration.push({
              route: normalizeRoute(routeName),
              source: this.sourceId,
              confidence: "medium",
              stages,
            });
          }
        }
      }

      if (!foundRoutes) {
        const plainRoutePattern =
          /^((?:Oral|Intranasal|Inhalation|Insufflated|IV|IM|Rectal|Sublingual|Smoked|Vaporized|Vapourized|Transdermal)(?:\s*\([^)]+\))?)\s*$/im;
        const lines = timelineSection.split("\n");
        let currentRoute = "Oral";
        let currentContent = "";

        for (const line of lines) {
          const routeMatch = line.match(plainRoutePattern);
          if (routeMatch && routeMatch[1]) {
            if (currentContent) {
              const stages = this.parseTimelineStages(currentContent);
              if (Object.keys(stages).length > 0) {
                foundRoutes = true;
                result.duration.push({
                  route: normalizeRoute(cleanRouteName(currentRoute)),
                  source: this.sourceId,
                  confidence: "medium",
                  stages,
                });
              }
            }
            currentRoute = routeMatch[1];
            currentContent = "";
          } else {
            currentContent += `${line}\n`;
          }
        }

        if (currentContent) {
          const stages = this.parseTimelineStages(currentContent);
          if (Object.keys(stages).length > 0) {
            foundRoutes = true;
            result.duration.push({
              route: normalizeRoute(cleanRouteName(currentRoute)),
              source: this.sourceId,
              confidence: "medium",
              stages,
            });
          }
        }
      }

      if (!foundRoutes) {
        const stages = this.parseTimelineStages(timelineSection);
        if (Object.keys(stages).length > 0) {
          result.duration.push({
            route: "Oral",
            source: this.sourceId,
            confidence: "low",
            stages,
          });
        }
      }

      if (result.duration.length > 0) result.sectionsExtracted.push("duration");
    }

    if (result.duration.length === 0) {
      const section1Match = content.match(/#\s*Section\s*1[:\s]+Routes.*?Dose([\s\S]*?)(?=#\s*Section\s*2|$)/i);
      if (section1Match) {
        const h3RoutePattern = /###\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*\n([\s\S]*?)(?=###|##|$)/gi;
        let routeMatch: RegExpExecArray | null;
        while ((routeMatch = h3RoutePattern.exec(section1Match[1])) !== null) {
          const routeName = routeMatch[1].trim().replace(/\s*\([^)]+\)\s*/g, "");
          const timelineSubsectionMatch = routeMatch[2].match(/\*\*Timeline\*\*\s*\n([\s\S]*?)(?=\*\*[A-Z]|###|$)/i);
          if (timelineSubsectionMatch) {
            const stages = this.parseTimelineStages(timelineSubsectionMatch[1]);
            if (Object.keys(stages).length > 0) {
              result.duration.push({
                route: normalizeRoute(routeName),
                source: this.sourceId,
                confidence: "medium",
                stages,
              });
            }
          }
        }

        if (result.duration.length > 0) result.sectionsExtracted.push("duration");
      }
    }

    const effectsSection = extractSection(content, "Effects", 2);
    if (effectsSection) {
      for (const category of ["Positive", "Negative", "Recreational", "Medical", "Sexual"]) {
        const catSection = extractSection(effectsSection, category, 4);
        if (catSection) {
          const bullets = extractBulletList(catSection);
          for (const bullet of bullets) {
            result.effects.push({
              name: cleanMarkdown(bullet),
              category:
                category === "Positive" || category === "Recreational"
                  ? "positive"
                  : category === "Negative"
                    ? "negative"
                    : "neutral",
              source: this.sourceId,
            });
          }
        }
      }
      if (result.effects.length > 0) result.sectionsExtracted.push("effects");
    }

    const chemistry: Partial<ParsedChemistry> = { sources: [this.sourceId] };
    const formulaMatch = content.match(/Molecular formula:\s*([A-Za-z0-9]+)/i);
    if (formulaMatch) chemistry.formula = formulaMatch[1].trim();
    const weightMatch = content.match(/Molecular weight:\s*([^\n]+)/i);
    if (weightMatch) chemistry.molecularWeight = weightMatch[1].trim();
    const iupacMatch = content.match(/IUPAC:\s*([^\n]+)/i);
    if (iupacMatch) {
      const iupac = iupacMatch[1].trim();
      if (iupac.length >= 10) chemistry.iupac = iupac;
    }

    if (Object.keys(chemistry).length > 1) {
      result.chemistry = chemistry;
      result.sectionsExtracted.push("chemistry");
    }

    const overviewMatch = content.match(/\*Source:[^\n]+\*\n\n([\s\S]*?)(?=\n---|\n##)/);
    if (overviewMatch) {
      const overview = stripReferences(cleanMarkdown(overviewMatch[1])).trim();
      if (overview.length >= 50) {
        result.narrativeContent.generalNotes = [
          {
            source: this.sourceId,
            section: "overview",
            content: overview,
          },
        ];
        result.sectionsExtracted.push("overview");
      }
    }

    for (const [sectionName, key] of [
      ["Safety", "safety"],
      ["History", "history"],
      ["Pharmacology", "pharmacology"],
      ["Chemistry", "chemistry"],
    ] as const) {
      const section = extractSection(content, sectionName, 2);
      if (section) {
        const cleaned = stripReferences(cleanMarkdown(section)).trim();
        if (cleaned.length >= 50) {
          result.narrativeContent.generalNotes.push({
            source: this.sourceId,
            section: key,
            content: cleaned,
          });
          if (key !== "chemistry") result.sectionsExtracted.push(key);
        }
      }
    }

    const legalSection = extractSection(content, "Legal Status", 2);
    if (legalSection) {
      if (legalSection.includes("1971 Convention") || legalSection.includes("Convention on Psychotropic Substances")) {
        result.internationalLaw.push({
          treaty: "UN Convention on Psychotropic Substances 1971",
          source: this.sourceId,
        });
      }
      if (legalSection.includes("1961 Convention") || legalSection.includes("Single Convention on Narcotic")) {
        result.internationalLaw.push({
          treaty: "Single Convention on Narcotic Drugs 1961",
          source: this.sourceId,
        });
      }

      const countryPattern = /####\s*([^\n]+)([\s\S]*?)(?=####|##|$)/gi;
      let match: RegExpExecArray | null;
      while ((match = countryPattern.exec(legalSection)) !== null) {
        const countryRaw = match[1].trim();
        const fullText = cleanMarkdown(match[2]).trim();
        if (!countryRaw || !fullText || countryRaw.toLowerCase().includes("check your local")) continue;

        let country = countryRaw;
        if (country.toLowerCase().startsWith("us ") || country.toLowerCase() === "us") {
          country = "United States";
        }
        country = country.replace(/\s*\([^)]*\)\s*$/, "").trim();
        const normalized = normalizeCountry(country);
        if (normalized) {
          const { status, notes } = extractStatusAndNotes(fullText);
          result.legal.push({
            country: normalized,
            status: status || fullText,
            details: notes || undefined,
            source: this.sourceId,
          });
        }
      }

      if (result.legal.length > 0) result.sectionsExtracted.push("legal");
      if (result.internationalLaw.length > 0) result.sectionsExtracted.push("international_law");
    }

    return result;
  }

  private parseTimelineStages(content: string): ParsedDurationRoute["stages"] {
    const stages: ParsedDurationRoute["stages"] = {};
    const cleanDurationValue = (value: string) =>
      value.trim().replace(/^~\s*/, "").replace(/\s*\([^)]+\)\s*$/, "").trim();
    const stagePatterns = [
      { pattern: /Total(?:\s*\([^)]+\))?[:\s]+([^\n]+)/i, field: "total" },
      { pattern: /Onset(?:\s*\([^)]+\))?[:\s]+([^\n]+)/i, field: "onset" },
      { pattern: /Strongest(?:\s*\([^)]+\))?[:\s]+([^\n]+)/i, field: "peak" },
      { pattern: /Peak(?:\s*\([^)]+\))?[:\s]+([^\n]+)/i, field: "peak" },
      { pattern: /Come\s*down(?:\s*\([^)]+\))?[:\s]+([^\n]+)/i, field: "offset" },
      { pattern: /After\s*effects?(?:\s*\([^)]+\))?[:\s]+([^\n]+)/i, field: "afterEffects" },
    ];

    for (const { pattern, field } of stagePatterns) {
      if ((stages as Record<string, unknown>)[field]) continue;
      const stageMatch = content.match(pattern);
      if (stageMatch) {
        const parsed = parseDurationRange(cleanDurationValue(stageMatch[1]));
        if (parsed) {
          (stages as Record<string, unknown>)[field] = parsed;
        }
      }
    }

    return stages;
  }
}

export const drugClassroomParser = new DrugClassroomParser();
