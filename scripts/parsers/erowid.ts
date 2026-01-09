/**
 * Erowid Parser
 * Medium-high structure with dose, effects, duration, and detailed harm info
 *
 * Format:
 * - ## Effects with DURATION #, EFFECTS LIST # (POSITIVE/NEUTRAL/NEGATIVE)
 * - ## Dosage with **Route** headers and dose ranges
 * - ## Law with U.S. FEDERAL LAW #, INTERNATIONAL LAW #
 * - ## Chemistry
 * - DESCRIPTION # (narrative)
 * - PROBLEMS or Health # with Contraindications, Addiction Potential
 */

import type {
  SourceParser,
  ParserResult,
  ParsedDosageRoute,
  ParsedDurationRoute,
  ParsedEffect,
  ParsedLegalStatus,
  ParsedHarmReduction,
  DoseRange,
  DurationRange,
} from "./types";

import {
  createEmptyParserResult,
  extractBulletList,
  cleanMarkdown,
} from "./base";

// === Section Extraction ===

/**
 * Extract content from ## Markdown headers (main sections)
 */
function extractErowidMarkdownSection(content: string, sectionName: string): string | undefined {
  // Match ## Section header and capture until next ## header or end
  // Use greedy match to end of string, then cut at next ## header
  const pattern = new RegExp(
    `^## ${sectionName}\\s*\\n([\\s\\S]*)`,
    "im"
  );
  const match = content.match(pattern);
  if (!match) return undefined;

  let sectionContent = match[1];

  // Find the next ## header and cut there
  const nextHeaderMatch = sectionContent.match(/^## /m);
  if (nextHeaderMatch && nextHeaderMatch.index !== undefined) {
    sectionContent = sectionContent.slice(0, nextHeaderMatch.index);
  }

  return sectionContent.trim();
}

/**
 * Extract content from SECTION # markers (subsections within main sections)
 */
function extractErowidSubsection(content: string, sectionName: string): string | undefined {
  // Erowid uses format: "SECTION NAME #" followed by content until next marker
  const pattern = new RegExp(
    `${sectionName}\\s*#([\\s\\S]*?)(?=\\n[A-Z][A-Z\\s]+#|$)`,
    "i"
  );
  const match = content.match(pattern);
  return match ? match[1].trim() : undefined;
}

// === Dosage Parsing ===

function parseDosageSection(content: string, sourceId: string): ParsedDosageRoute[] {
  // Try markdown section first, then fallback to old pattern
  const dosageSection = extractErowidMarkdownSection(content, "Dosage") ||
                        extractErowidSubsection(content, "DOSAGE DESCRIPTION") ||
                        extractErowidSubsection(content, "Dose");

  if (!dosageSection) return [];

  const routes: ParsedDosageRoute[] = [];

  // Find route blocks: **Oral**, **Insufflated**, **Smoked**, **IM**, **IV**, etc.
  // Split content by route headers
  const routePattern = /\*\*([A-Za-z/]+)\*\*/g;
  const routeMatches = [...dosageSection.matchAll(routePattern)];

  if (routeMatches.length > 0) {
    // Process each route
    for (let i = 0; i < routeMatches.length; i++) {
      const routeName = routeMatches[i][1];
      const startIdx = routeMatches[i].index! + routeMatches[i][0].length;
      const endIdx = routeMatches[i + 1]?.index ?? dosageSection.length;
      const routeContent = dosageSection.slice(startIdx, endIdx);

      // Skip if this looks like a header rather than actual dose content
      if (routeName.toLowerCase().includes("dosage") || routeName.length > 20) {
        continue;
      }

      const ranges = parseErowidDoseRanges(routeContent);

      if (Object.keys(ranges).length > 0) {
        routes.push({
          route: normalizeRouteName(routeName),
          source: sourceId,
          confidence: "medium",
          ranges,
          notes: extractDosageNotes(dosageSection),
        });
      }
    }
  }

  // Fallback: if no routes found, try to parse as generic dose ranges
  if (routes.length === 0) {
    const ranges = parseErowidDoseRanges(dosageSection);
    if (Object.keys(ranges).length > 0) {
      routes.push({
        route: "Oral",
        source: sourceId,
        confidence: "low",
        ranges,
        notes: extractDosageNotes(dosageSection),
      });
    }
  }

  return routes;
}

function normalizeRouteName(route: string): string {
  const normalized = route.toLowerCase().trim();
  const routeMap: Record<string, string> = {
    "oral": "Oral",
    "insufflated": "Insufflated",
    "nasal": "Insufflated",
    "smoked": "Smoked",
    "vapourised": "Smoked",
    "vaporized": "Smoked",
    "im": "Intramuscular",
    "intramuscular": "Intramuscular",
    "iv": "Intravenous",
    "intravenous": "Intravenous",
    "sublingual": "Sublingual",
    "buccal": "Buccal",
    "rectal": "Rectal",
    "plugged": "Rectal",
    "transdermal": "Transdermal",
  };
  return routeMap[normalized] || route;
}

function parseErowidDoseRanges(content: string): ParsedDosageRoute["ranges"] {
  const ranges: ParsedDosageRoute["ranges"] = {};

  // Pattern for labeled ranges: "- Threshold: 2 - 5 mg" or "- Light: 5-15mg"
  const labeledPattern = /-\s*(Threshold|Light|Common|Moderate|Strong|Heavy):\s*(?:~)?(\d+(?:\.\d+)?)\s*[-–]?\s*(\d+(?:\.\d+)?)?\s*(mg|µg|ug|g|ml)/gi;

  let match: RegExpExecArray | null;
  while ((match = labeledPattern.exec(content)) !== null) {
    const label = match[1].toLowerCase();
    const min = parseFloat(match[2]);
    const max = match[3] ? parseFloat(match[3]) : min;
    const unit = match[4].toLowerCase();

    const range: DoseRange = { min, max, unit };

    switch (label) {
      case "threshold":
        ranges.threshold = range;
        break;
      case "light":
        ranges.light = range;
        break;
      case "common":
      case "moderate":
        ranges.common = range;
        break;
      case "strong":
        ranges.strong = range;
        break;
      case "heavy":
        ranges.heavy = range;
        break;
    }
  }

  return ranges;
}

function extractDosageNotes(section: string): string | undefined {
  const notesSection = extractErowidSubsection(section, "NOTES");
  if (notesSection && notesSection !== "None") {
    return cleanMarkdown(notesSection);
  }
  return undefined;
}

// === Duration Parsing ===

function parseDurationSection(content: string, sourceId: string): ParsedDurationRoute[] {
  // Duration is typically inside ## Effects section under DURATION #
  const effectsSection = extractErowidMarkdownSection(content, "Effects");
  const durationSubsection = effectsSection
    ? extractErowidSubsection(effectsSection, "DURATION")
    : extractErowidSubsection(content, "DURATION");

  if (!durationSubsection) return [];

  const routes: ParsedDurationRoute[] = [];

  // Find route blocks within duration section
  const routePattern = /\*\*([A-Za-z/]+)\*\*/g;
  const routeMatches = [...durationSubsection.matchAll(routePattern)];

  if (routeMatches.length > 0) {
    for (let i = 0; i < routeMatches.length; i++) {
      const routeName = routeMatches[i][1];

      // Skip headers like "2C-B Duration"
      if (routeName.toLowerCase().includes("duration") || routeName.length > 15) {
        continue;
      }

      const startIdx = routeMatches[i].index! + routeMatches[i][0].length;
      const endIdx = routeMatches[i + 1]?.index ?? durationSubsection.length;
      const routeContent = durationSubsection.slice(startIdx, endIdx);

      const stages = parseErowidDurationStages(routeContent);

      if (Object.keys(stages).length > 0) {
        routes.push({
          route: normalizeRouteName(routeName),
          source: sourceId,
          confidence: "medium",
          stages,
        });
      }
    }
  }

  // Fallback: parse as single route if no route headers found
  if (routes.length === 0) {
    const stages = parseErowidDurationStages(durationSubsection);
    if (Object.keys(stages).length > 0) {
      routes.push({
        route: "Oral",
        source: sourceId,
        confidence: "medium",
        stages,
      });
    }
  }

  return routes;
}

function parseErowidDurationStages(content: string): ParsedDurationRoute["stages"] {
  const stages: ParsedDurationRoute["stages"] = {};

  // Pattern for labeled stages: "- Total Duration: 4 - 8 hrs" or "- Onset: 45-75 mins"
  const stagePatterns: Array<{ names: string[]; key: keyof ParsedDurationRoute["stages"] }> = [
    { names: ["Total Duration", "Total"], key: "total" },
    { names: ["Onset"], key: "onset" },
    { names: ["Coming Up", "Come Up", "Comeup"], key: "comeUp" },
    { names: ["Peak", "Plateau"], key: "peak" },
    { names: ["Coming Down", "Come Down", "Comedown", "Offset"], key: "offset" },
    { names: ["After Effects", "Aftereffects", "After-effects"], key: "afterEffects" },
  ];

  for (const { names, key } of stagePatterns) {
    for (const name of names) {
      const pattern = new RegExp(
        `-?\\s*${name}:\\s*(\\d+(?:\\.\\d+)?)\\s*[-–]\\s*(\\d+(?:\\.\\d+)?)\\s*(mins?|minutes?|hrs?|hours?)`,
        "i"
      );
      const match = content.match(pattern);
      if (match) {
        const range: DurationRange = {
          min: parseFloat(match[1]),
          max: parseFloat(match[2]),
          unit: match[3].toLowerCase().startsWith("h") ? "hours" : "minutes",
        };
        stages[key] = range;
        break;
      }
    }
  }

  return stages;
}

// === Effects Parsing ===

function parseEffectsSection(content: string, sourceId: string): ParsedEffect[] {
  // Get ## Effects section
  const effectsSection = extractErowidMarkdownSection(content, "Effects");
  if (!effectsSection) return [];

  const effects: ParsedEffect[] = [];

  // Find EFFECTS LIST # subsection
  const effectsListSection = extractErowidSubsection(effectsSection, "EFFECTS LIST");
  const targetSection = effectsListSection || effectsSection;

  // Parse POSITIVE, NEUTRAL, NEGATIVE categories
  const categories: Array<{ name: string; category: ParsedEffect["category"] }> = [
    { name: "POSITIVE", category: "positive" },
    { name: "NEUTRAL", category: "neutral" },
    { name: "NEGATIVE", category: "negative" },
  ];

  for (const { name, category } of categories) {
    // Match category header (allowing leading whitespace) and capture until next category
    // The format is: "\n \nPOSITIVE\n \n- effect 1\n..."
    const pattern = new RegExp(
      `${name}\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:POSITIVE|NEUTRAL|NEGATIVE)\\s*\\n|\\n[A-Z]+ #|$)`,
      "i"
    );
    const match = targetSection.match(pattern);

    if (match) {
      const categoryContent = match[1];
      const bullets = extractBulletList(categoryContent);

      for (const bullet of bullets) {
        const cleaned = cleanMarkdown(bullet).trim();
        if (cleaned.length > 2 && !cleaned.toLowerCase().includes("see below")) {
          effects.push({
            name: cleaned,
            category,
            source: sourceId,
          });
        }
      }
    }
  }

  return effects;
}

// === Legal Status Parsing ===

function parseLegalSection(content: string, sourceId: string): ParsedLegalStatus[] {
  // Try markdown section first
  const lawSection = extractErowidMarkdownSection(content, "Law") ||
                     extractErowidSubsection(content, "Law");
  if (!lawSection) return [];

  const statuses: ParsedLegalStatus[] = [];

  // Look for U.S. Federal section
  const federalSection = extractErowidSubsection(lawSection, "U.S. FEDERAL LAW");
  if (federalSection) {
    // Look for schedule information
    const scheduleMatch = federalSection.match(/Schedule\s*([IVX]+)/i);
    if (scheduleMatch) {
      statuses.push({
        country: "United States",
        status: `Schedule ${scheduleMatch[1]}`,
        details: cleanMarkdown(federalSection),
        source: sourceId,
      });
    } else {
      // Look for other status indicators
      const statusMatch = federalSection.match(/(unscheduled|not scheduled|controlled|illegal|legal)/i);
      if (statusMatch) {
        statuses.push({
          country: "United States",
          status: statusMatch[1],
          details: cleanMarkdown(federalSection),
          source: sourceId,
        });
      }
    }
  }

  // Parse international law entries
  const internationalSection = extractErowidSubsection(lawSection, "INTERNATIONAL LAW");
  if (internationalSection) {
    // Look for country headers with # markers
    const countryPattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*#\s*$/gm;
    let countryMatch: RegExpExecArray | null;
    const countryMatches: Array<{ name: string; index: number }> = [];

    while ((countryMatch = countryPattern.exec(internationalSection)) !== null) {
      countryMatches.push({ name: countryMatch[1], index: countryMatch.index });
    }

    for (let i = 0; i < countryMatches.length && statuses.length < 10; i++) {
      const country = countryMatches[i].name;
      const startIdx = countryMatches[i].index + country.length + 2;
      const endIdx = countryMatches[i + 1]?.index ?? internationalSection.length;
      const countryContent = internationalSection.slice(startIdx, endIdx).trim();

      if (countryContent.length > 5) {
        statuses.push({
          country,
          status: cleanMarkdown(countryContent),  // No truncation - full legal details
          source: sourceId,
        });
      }
    }
  }

  return statuses;
}

// === Harm Reduction Parsing ===

function parseHarmSection(content: string, sourceId: string): ParsedHarmReduction | undefined {
  const problemsSection = extractErowidSubsection(content, "PROBLEMS");
  const healthSection = extractErowidSubsection(content, "Health");

  const section = problemsSection || healthSection;
  if (!section) return undefined;

  const harmReduction: ParsedHarmReduction = {
    rules: [],
    shortTermRisks: [],
    longTermRisks: [],
    contraindications: [],
    sources: [sourceId],
  };

  // Look for contraindications
  const contraSection = extractErowidSubsection(section, "Contraindications");
  if (contraSection) {
    harmReduction.contraindications = extractBulletList(contraSection).map(cleanMarkdown);
  }

  // Look for addiction potential
  const addictionSection = extractErowidSubsection(section, "Addiction Potential");
  if (addictionSection) {
    harmReduction.shortTermRisks?.push(
      `Addiction potential: ${cleanMarkdown(addictionSection)}`
    );
  }

  // Look for long term health problems
  const longTermSection = extractErowidSubsection(section, "Long Term Health");
  if (longTermSection) {
    harmReduction.longTermRisks = extractBulletList(longTermSection).map(cleanMarkdown);
    if (harmReduction.longTermRisks.length === 0) {
      harmReduction.longTermRisks.push(cleanMarkdown(longTermSection));
    }
  }

  // Look for risk of death information
  const deathSection = extractErowidSubsection(section, "Risk of Death");
  if (deathSection && !deathSection.includes("Summary Needed")) {
    harmReduction.longTermRisks?.push(`Risk of death: ${cleanMarkdown(deathSection)}`);
  }

  const hasContent =
    (harmReduction.rules?.length ?? 0) > 0 ||
    (harmReduction.shortTermRisks?.length ?? 0) > 0 ||
    (harmReduction.longTermRisks?.length ?? 0) > 0 ||
    (harmReduction.contraindications?.length ?? 0) > 0;

  return hasContent ? harmReduction : undefined;
}

// === Narrative Extraction Functions ===

/**
 * Extract Chemistry section narrative
 */
function parseChemistryNarrative(content: string, sourceId: string): string | undefined {
  const chemSection = extractErowidSubsection(content, "Chemistry");
  if (chemSection && !chemSection.includes("Summary Needed") && chemSection.length > 30) {
    return cleanMarkdown(chemSection);
  }
  return undefined;
}

/**
 * Extract Pharmacology section narrative
 */
function parsePharmacologyNarrative(content: string, sourceId: string): string | undefined {
  const pharmacoSection = extractErowidSubsection(content, "Pharmacology");
  if (pharmacoSection && !pharmacoSection.includes("Summary Needed") && pharmacoSection.length > 30) {
    return cleanMarkdown(pharmacoSection);
  }
  return undefined;
}

/**
 * Extract Production section narrative
 */
function parseProductionNarrative(content: string, sourceId: string): string | undefined {
  const productionSection = extractErowidSubsection(content, "Production");
  if (productionSection && !productionSection.includes("Summary Needed") && productionSection.length > 30) {
    return cleanMarkdown(productionSection);
  }
  return undefined;
}

/**
 * Extract History section narrative
 */
function parseHistoryNarrative(content: string, sourceId: string): string | undefined {
  const historySection = extractErowidSubsection(content, "History");
  if (historySection && !historySection.includes("Summary Needed") && historySection.length > 30) {
    return cleanMarkdown(historySection);
  }
  return undefined;
}

/**
 * Extract Effects DESCRIPTION prose (not effects list)
 */
function parseEffectsDescriptionNarrative(content: string, sourceId: string): string | undefined {
  // Get the ## Effects section
  const effectsSection = extractErowidMarkdownSection(content, "Effects");
  if (!effectsSection) return undefined;

  // Look for DESCRIPTION # within Effects
  const descSection = extractErowidSubsection(effectsSection, "DESCRIPTION");
  if (descSection && descSection.length > 50) {
    return cleanMarkdown(descSection);
  }
  return undefined;
}

/**
 * Extract PROBLEMS section prose (detailed harm reduction guidance)
 */
function parseProblemsNarrative(content: string, sourceId: string): string | undefined {
  const problemsSection = extractErowidSubsection(content, "PROBLEMS");
  if (problemsSection && problemsSection.length > 100) {
    // Extract the prose paragraphs before specific subsections
    // This contains set/setting guidance, sitter recommendations, etc.
    return cleanMarkdown(problemsSection);
  }
  return undefined;
}

/**
 * Extract Dosage Description narrative (prose about dosing)
 */
function parseDosageDescriptionNarrative(content: string, sourceId: string): string | undefined {
  const dosageSection = extractErowidMarkdownSection(content, "Dosage");
  if (!dosageSection) return undefined;

  // Get the DOSAGE DESCRIPTION subsection
  const descSection = extractErowidSubsection(dosageSection, "DOSAGE DESCRIPTION");
  if (descSection && descSection.length > 50) {
    // Remove the structured dose ranges, keep prose
    const prose = descSection.split(/\*\*[A-Za-z]+ (?:Oral )?Dosages\*\*/)[0];
    if (prose && prose.length > 50) {
      return cleanMarkdown(prose);
    }
  }
  return undefined;
}

/**
 * Extract Terminology/Slang section
 */
function parseTerminologyNarrative(content: string, sourceId: string): string | undefined {
  const termSection = extractErowidSubsection(content, "Terminology / Slang") ||
                      extractErowidSubsection(content, "Terminology");
  if (termSection && termSection.length > 30) {
    return cleanMarkdown(termSection);
  }
  return undefined;
}

/**
 * Extract main DESCRIPTION section (primary description)
 */
function parseMainDescription(content: string, sourceId: string): string | undefined {
  // Get the Basics section's DESCRIPTION (main substance description)
  const basicsSection = extractErowidMarkdownSection(content, "Basics");
  if (basicsSection) {
    const descSection = extractErowidSubsection(basicsSection, "DESCRIPTION");
    if (descSection && descSection.length > 50) {
      return cleanMarkdown(descSection);
    }
  }

  // Fallback: try to find DESCRIPTION anywhere
  const descSection = extractErowidSubsection(content, "DESCRIPTION");
  if (descSection && descSection.length > 50) {
    return cleanMarkdown(descSection);
  }
  return undefined;
}

// === Main Parser ===

export class ErowidParser implements SourceParser {
  sourceId = "erowid";

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // Parse structured sections
    result.dosage = parseDosageSection(content, this.sourceId);
    result.duration = parseDurationSection(content, this.sourceId);
    result.effects = parseEffectsSection(content, this.sourceId);
    result.legal = parseLegalSection(content, this.sourceId);
    result.harmReduction = parseHarmSection(content, this.sourceId);

    // Track extracted structured sections
    if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");
    if (result.duration.length > 0) result.sectionsExtracted.push("duration");
    if (result.effects.length > 0) result.sectionsExtracted.push("effects");
    if (result.legal.length > 0) result.sectionsExtracted.push("legal");
    if (result.harmReduction) result.sectionsExtracted.push("harm_reduction");

    // === Extract narrative content (no truncation) ===

    // Main description (primary substance overview)
    const mainDesc = parseMainDescription(content, this.sourceId);
    if (mainDesc) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "description",
        content: mainDesc,
      });
      result.sectionsExtracted.push("description");
    }

    // Chemistry narrative
    const chemistryNarrative = parseChemistryNarrative(content, this.sourceId);
    if (chemistryNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "chemistry",
        content: chemistryNarrative,
      });
    }

    // Pharmacology narrative
    const pharmacologyNarrative = parsePharmacologyNarrative(content, this.sourceId);
    if (pharmacologyNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "pharmacology",
        content: pharmacologyNarrative,
      });
    }

    // Production narrative
    const productionNarrative = parseProductionNarrative(content, this.sourceId);
    if (productionNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "production",
        content: productionNarrative,
      });
    }

    // History narrative
    const historyNarrative = parseHistoryNarrative(content, this.sourceId);
    if (historyNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "history",
        content: historyNarrative,
      });
      result.sectionsExtracted.push("history");
    }

    // Effects description (prose about effects, not the list)
    const effectsDesc = parseEffectsDescriptionNarrative(content, this.sourceId);
    if (effectsDesc) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "effects_description",
        content: effectsDesc,
      });
    }

    // Problems/harm reduction prose (set/setting guidance)
    const problemsNarrative = parseProblemsNarrative(content, this.sourceId);
    if (problemsNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "harm_reduction_guidance",
        content: problemsNarrative,
      });
    }

    // Dosage description narrative
    const dosageDesc = parseDosageDescriptionNarrative(content, this.sourceId);
    if (dosageDesc) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "dosage_context",
        content: dosageDesc,
      });
    }

    // Terminology/slang
    const terminologyNarrative = parseTerminologyNarrative(content, this.sourceId);
    if (terminologyNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "terminology",
        content: terminologyNarrative,
      });
    }

    return result;
  }
}

export const erowidParser = new ErowidParser();
