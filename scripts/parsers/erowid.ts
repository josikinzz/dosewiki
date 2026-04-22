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
  ParsedInternationalLaw,
  ParsedHarmReduction,
  DoseRange,
  DurationRange,
} from "./types";

import {
  createEmptyParserResult,
  extractBulletList,
  cleanMarkdown,
  normalizeCountry,
  extractStatusAndNotes,
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
  // Try multiple section formats in order of specificity
  const dosageSection = extractErowidMarkdownSection(content, "Dosage") ||
                        extractErowidSubsection(content, "DOSAGE DESCRIPTION") ||
                        extractErowidSubsection(content, "DOSAGE") ||
                        extractErowidSubsection(content, "Dose") ||
                        extractErowidSubsection(content, "DOSE");

  // If no dedicated section found, try to find dosage data anywhere in content
  // by looking for dose tier labels with numeric values
  const searchContent = dosageSection || content;

  if (!dosageSection && !content.match(/-?\s*(Threshold|Light|Common|Moderate|Strong|Heavy):?\s*[≤<]?~?\d/i)) {
    return [];
  }

  const routes: ParsedDosageRoute[] = [];

  // Find route blocks: **Oral**, **Insufflated**, **Smoked**, **IM**, **IV**, etc.
  // Also handles format: **Insufflated / Nasal Ketamine Dosages** -> extracts "Insufflated"
  const routePattern = /\*\*([^*]+)\*\*/g;
  const routeMatches = [...searchContent.matchAll(routePattern)];

  if (routeMatches.length > 0) {
    // Process each route
    for (let i = 0; i < routeMatches.length; i++) {
      let routeName = routeMatches[i][1].trim();
      const startIdx = routeMatches[i].index! + routeMatches[i][0].length;
      const endIdx = routeMatches[i + 1]?.index ?? searchContent.length;
      const routeContent = searchContent.slice(startIdx, endIdx);

      // Skip non-route headers like "( very tentative )" or "many" or "Created by..."
      if (routeName.startsWith("(") ||
          routeName.toLowerCase().includes("created by") ||
          routeName.toLowerCase() === "many" ||
          routeName.toLowerCase().includes("onset") ||
          routeName.toLowerCase().includes("every individual")) {
        continue;
      }

      // Extract route from various Erowid formats:
      // Format 1: "Insufflated / Nasal Ketamine Dosages" -> "Insufflated"
      // Format 2: "Oral 2C-I Dosages" -> "Oral"
      // Format 3: "DPT Dosage - Oral" -> "Oral"
      // Format 4: "LSD Oral Dosages" -> "Oral"
      // Format 5: "DPT Dosages - Smoked/Vaporized Freebase Oil" -> "Smoked"

      // Handle "Substance Dosage - Route" format (e.g., "DPT Dosage - Oral")
      const dashMatch = routeName.match(/dosages?\s*[-–]\s*(.+)/i);
      if (dashMatch) {
        routeName = dashMatch[1].split(/\s*[\/,]\s*/)[0].trim();
      }
      // Handle "Route Substance Dosages" format (e.g., "Insufflated / Nasal Ketamine Dosages")
      else if (routeName.toLowerCase().includes("dosage")) {
        const beforeDosage = routeName.split(/\s+dosages?/i)[0].trim();
        // Take first route if multiple listed (e.g., "Insufflated / Nasal" -> "Insufflated")
        routeName = beforeDosage.split(/\s*[\/,]\s*/)[0].trim();
      }

      // Known route names
      const knownRoutes = ["oral", "insufflated", "nasal", "smoked", "im", "i.m.", "iv", "i.v.",
                           "intravenous", "intramuscular", "sublingual", "buccal", "rectal",
                           "transdermal", "inhaled", "vaporized", "vapourised"];

      // Extract just the route name if substance name is included
      // E.g., "Oral 2C-I" -> "Oral", "LSD Oral" -> "Oral"
      const routeWords = routeName.split(/\s+/);
      if (routeWords.length > 1) {
        // Check if first word is a known route
        if (knownRoutes.includes(routeWords[0].toLowerCase())) {
          routeName = routeWords[0];
        }
        // Check if last word is a known route (for "LSD Oral" format)
        else if (knownRoutes.includes(routeWords[routeWords.length - 1].toLowerCase())) {
          routeName = routeWords[routeWords.length - 1];
        }
      }

      // Skip if not a known route
      if (!knownRoutes.includes(routeName.toLowerCase())) {
        continue;
      }

      const ranges = parseErowidDoseRanges(routeContent);

      if (Object.keys(ranges).length > 0) {
        routes.push({
          route: normalizeRouteName(routeName),
          source: sourceId,
          confidence: "medium",
          ranges,
          notes: extractDosageNotes(searchContent),
        });
      }
    }
  }

  // Fallback: if no routes found, try to parse as generic dose ranges
  if (routes.length === 0) {
    const ranges = parseErowidDoseRanges(searchContent);
    if (Object.keys(ranges).length > 0) {
      routes.push({
        route: "Oral",
        source: sourceId,
        confidence: "low",
        ranges,
        notes: extractDosageNotes(searchContent),
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

  // Helper to normalize unit strings
  const normalizeUnit = (unit: string): string => {
    const u = unit.toLowerCase().trim();
    if (u === "grams" || u === "gram") return "g";
    if (u === "µg" || u === "ug" || u === "mcg") return "µg";
    return u;
  };

  // Helper to assign range to appropriate tier
  const assignRange = (label: string, range: DoseRange) => {
    switch (label.toLowerCase()) {
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
  };

  let match: RegExpExecArray | null;

  // Pattern 1: Standard labeled ranges with optional compound units
  // Handles: "- Threshold: 2.5 mg Psilocybin", "- Light: 5-15mg", "- Common: 0.066 gram"
  // Also handles threshold symbols: "≤0.3 mg", "<0.2 mg"
  const labeledPattern = /-?\s*(Threshold|Light|Common|Moderate|Strong|Heavy):?\s*[≤<]?~?(\d+(?:\.\d+)?)\s*[-–]?\s*(\d+(?:\.\d+)?)?\s*(mg|µg|ug|mcg|g|grams?|gram|ml)(?:\s+\w+)?/gi;

  while ((match = labeledPattern.exec(content)) !== null) {
    const label = match[1];
    const min = parseFloat(match[2]);
    const max = match[3] ? parseFloat(match[3]) : min;
    const unit = normalizeUnit(match[4]);

    assignRange(label, { min, max, unit });
  }

  // Pattern 2: Pipe-separated format (Erowid ketamine style)
  // "- Threshold | .1 mg / lb | 10 - 15 mg"
  if (Object.keys(ranges).length === 0) {
    const pipePattern = /-\s*(Threshold|Light|Common|Moderate|Strong|Heavy|The K Hole)\s*\|[^|]+\|\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(mg|µg|ug|g|grams?|ml)/gi;

    while ((match = pipePattern.exec(content)) !== null) {
      let label = match[1];
      if (label.toLowerCase() === "the k hole") label = "heavy";

      const min = parseFloat(match[2]);
      const max = parseFloat(match[3]);
      const unit = normalizeUnit(match[4]);

      assignRange(label, { min, max, unit });
    }
  }

  // Pattern 3: Bullet list format without colon (psilocybin-mushrooms style)
  // "- Threshold  2.5 mg" or "- Light  2.5 - 10 mg"
  if (Object.keys(ranges).length === 0) {
    const bulletPattern = /-\s*(Threshold|Light|Common|Moderate|Strong|Heavy)\s+[≤<]?(\d+(?:\.\d+)?)\s*[-–]?\s*(\d+(?:\.\d+)?)?\s*(mg|µg|ug|g|grams?|gram|ml)(?:\s+\w+)?/gi;

    while ((match = bulletPattern.exec(content)) !== null) {
      const label = match[1];
      const min = parseFloat(match[2]);
      const max = match[3] ? parseFloat(match[3]) : min;
      const unit = normalizeUnit(match[4]);

      assignRange(label, { min, max, unit });
    }
  }

  // Pattern 4: Plus notation for heavy doses (e.g., "Heavy: 50 mg +", "900+ mg")
  if (!ranges.heavy) {
    const heavyPlusPattern = /-?\s*Heavy:?\s*(\d+(?:\.\d+)?)\s*\+?\s*(mg|µg|ug|g|grams?|ml)|(\d+(?:\.\d+)?)\s*\+\s*(mg|µg|ug|g|grams?|ml)/gi;
    match = heavyPlusPattern.exec(content);
    if (match) {
      const min = parseFloat(match[1] || match[3]);
      const unit = normalizeUnit(match[2] || match[4]);
      ranges.heavy = { min, max: min, unit };
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
  // Try multiple section formats in order of specificity
  const effectsSection = extractErowidMarkdownSection(content, "Effects");
  const durationSubsection = effectsSection
    ? extractErowidSubsection(effectsSection, "DURATION")
    : extractErowidSubsection(content, "DURATION") ||
      extractErowidSubsection(content, "Duration") ||
      extractErowidMarkdownSection(content, "Duration");

  // Check if duration data exists anywhere in full content
  // Pattern includes space before colon to catch formats like "Onset : 20 - 70 minutes"
  const hasDurationData = content.match(/-?\s*(Total Duration|Duration|Onset|Peak|Plateau|Coming Up|Coming Down|After Effects|Normal After Effects)\s*:?\s*\d/i);

  // If duration subsection exists but is empty/just caution text, fall back to full content
  let searchContent = durationSubsection || content;
  if (durationSubsection) {
    // Check if the subsection actually has numeric duration data
    const subsectionHasData = durationSubsection.match(/(Onset|Duration|Peak|Coming)\s*:?\s*\d/i);
    if (!subsectionHasData && hasDurationData) {
      // Duration section exists but is empty, use full content instead
      searchContent = content;
    }
  }

  if (!durationSubsection && !hasDurationData) return [];

  const routes: ParsedDurationRoute[] = [];

  // Find route blocks within duration section
  const routePattern = /\*\*([A-Za-z/]+)\*\*/g;
  const routeMatches = [...searchContent.matchAll(routePattern)];

  if (routeMatches.length > 0) {
    for (let i = 0; i < routeMatches.length; i++) {
      const routeName = routeMatches[i][1];

      // Skip headers like "2C-B Duration"
      if (routeName.toLowerCase().includes("duration") || routeName.length > 15) {
        continue;
      }

      const startIdx = routeMatches[i].index! + routeMatches[i][0].length;
      const endIdx = routeMatches[i + 1]?.index ?? searchContent.length;
      const routeContent = searchContent.slice(startIdx, endIdx);

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
    const stages = parseErowidDurationStages(searchContent);
    if (Object.keys(stages).length > 0) {
      routes.push({
        route: "Oral",
        source: sourceId,
        confidence: durationSubsection ? "medium" : "low",
        stages,
      });
    }
  }

  return routes;
}

function parseErowidDurationStages(content: string): ParsedDurationRoute["stages"] {
  const stages: ParsedDurationRoute["stages"] = {};

  // Stage name patterns to look for (including variations)
  const stagePatterns: Array<{ names: string[]; key: keyof ParsedDurationRoute["stages"] }> = [
    { names: ["Total Duration", "Total", "Duration"], key: "total" },
    { names: ["Onset"], key: "onset" },
    { names: ["Coming Up", "Come Up", "Comeup", "Come-up"], key: "comeUp" },
    { names: ["Peak", "Plateau"], key: "peak" },
    { names: ["Coming Down", "Come Down", "Comedown", "Come-down", "Offset"], key: "offset" },
    { names: ["Normal After Effects", "After Effects", "Aftereffects", "After-effects", "After effects"], key: "afterEffects" },
  ];

  // Helper to normalize time unit
  const normalizeTimeUnit = (unit: string): "hours" | "minutes" => {
    const u = unit.toLowerCase();
    if (u.startsWith("h") || u === "hours" || u === "hour" || u === "hrs" || u === "hr") {
      return "hours";
    }
    return "minutes";
  };

  for (const { names, key } of stagePatterns) {
    for (const name of names) {
      // Escape special regex chars in name
      const escapedName = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

      // Pattern 1: Range format with optional space before colon
      // Handles: "- Total Duration: 4 - 8 hrs", "Onset : 20 - 70 minutes", "Duration : 3 - 5 hours"
      // Also handles extra text in parentheses: "Onset : 20 - 70 minutes (depending on...)"
      const rangePattern = new RegExp(
        `-?\\s*${escapedName}\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*[-–]\\s*(\\d+(?:\\.\\d+)?)\\s*(mins?|minutes?|hrs?|hours?|secs?|seconds?)`,
        "i"
      );
      let match = content.match(rangePattern);
      if (match) {
        let unit = normalizeTimeUnit(match[3]);
        let min = parseFloat(match[1]);
        let max = parseFloat(match[2]);

        // Convert seconds to minutes
        if (match[3].toLowerCase().startsWith("sec")) {
          min = min / 60;
          max = max / 60;
          unit = "minutes";
        }

        stages[key] = { min, max, unit };
        break;
      }

      // Pattern 2: "up to X hours/minutes" format (e.g., "Normal After Effects : up to 24 hours")
      const upToPattern = new RegExp(
        `-?\\s*${escapedName}\\s*:?\\s*up\\s+to\\s+(\\d+(?:\\.\\d+)?)\\s*(mins?|minutes?|hrs?|hours?)`,
        "i"
      );
      match = content.match(upToPattern);
      if (match) {
        const unit = normalizeTimeUnit(match[2]);
        const value = parseFloat(match[1]);
        stages[key] = { min: 0, max: value, unit };
        break;
      }

      // Pattern 3: Single value format "- Total: 6 hours" or "Onset: 30 minutes"
      const singlePattern = new RegExp(
        `-?\\s*${escapedName}\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*(mins?|minutes?|hrs?|hours?|secs?|seconds?)`,
        "i"
      );
      match = content.match(singlePattern);
      if (match) {
        let unit = normalizeTimeUnit(match[2]);
        let value = parseFloat(match[1]);

        // Convert seconds to minutes
        if (match[2].toLowerCase().startsWith("sec")) {
          value = value / 60;
          unit = "minutes";
        }

        stages[key] = { min: value, max: value, unit };
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

interface LegalParseResult {
  legal: ParsedLegalStatus[];
  internationalLaw: ParsedInternationalLaw[];
}

function parseLegalSection(content: string, sourceId: string): LegalParseResult {
  // Try markdown section first
  const lawSection = extractErowidMarkdownSection(content, "Law") ||
                     extractErowidSubsection(content, "Law");
  if (!lawSection) return { legal: [], internationalLaw: [] };

  const statuses: ParsedLegalStatus[] = [];
  const treaties: ParsedInternationalLaw[] = [];

  // === Extract UN Conventions ===
  if (lawSection.includes("1971 Convention") || lawSection.includes("Psychotropic Substances")) {
    treaties.push({
      treaty: "UN Convention on Psychotropic Substances 1971",
      source: sourceId,
    });
  }
  if (lawSection.includes("1961 Convention") || lawSection.includes("Single Convention on Narcotic")) {
    treaties.push({
      treaty: "Single Convention on Narcotic Drugs 1961",
      source: sourceId,
    });
  }
  if (lawSection.includes("1988 Convention") || lawSection.includes("Against Illicit Traffic")) {
    treaties.push({
      treaty: "UN Convention Against Illicit Traffic 1988",
      source: sourceId,
    });
  }

  // === Look for U.S. Federal section ===
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

  // === Parse international law entries ===
  const internationalSection = extractErowidSubsection(lawSection, "INTERNATIONAL LAW");
  if (internationalSection) {
    // Look for country headers with # markers: "Australia #", "Canada #", etc.
    // More flexible pattern to catch various country name formats
    const countryPattern = /^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s*#\s*$/gm;
    let countryMatch: RegExpExecArray | null;
    const countryMatches: Array<{ name: string; index: number }> = [];

    while ((countryMatch = countryPattern.exec(internationalSection)) !== null) {
      countryMatches.push({ name: countryMatch[1], index: countryMatch.index });
    }

    for (let i = 0; i < countryMatches.length; i++) {
      const rawCountry = countryMatches[i].name;
      const startIdx = countryMatches[i].index + rawCountry.length + 2;
      const endIdx = countryMatches[i + 1]?.index ?? internationalSection.length;
      const countryContent = internationalSection.slice(startIdx, endIdx).trim();

      if (countryContent.length > 5) {
        const cleaned = cleanMarkdown(countryContent);
        const { status, notes } = extractStatusAndNotes(cleaned);

        statuses.push({
          country: normalizeCountry(rawCountry),
          status,
          details: notes || undefined,
          source: sourceId,
        });
      }
    }
  }

  return { legal: statuses, internationalLaw: treaties };
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

    const legalResult = parseLegalSection(content, this.sourceId);
    result.legal = legalResult.legal;
    result.internationalLaw = legalResult.internationalLaw;

    result.harmReduction = parseHarmSection(content, this.sourceId);

    // Track extracted structured sections
    if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");
    if (result.duration.length > 0) result.sectionsExtracted.push("duration");
    if (result.effects.length > 0) result.sectionsExtracted.push("effects");
    if (result.legal.length > 0) result.sectionsExtracted.push("legal");
    if (result.internationalLaw.length > 0) result.sectionsExtracted.push("international_law");
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
