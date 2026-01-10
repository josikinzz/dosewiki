/**
 * TripSit Parser
 * Handles both TripSit Factsheets and TripSit Wiki content
 *
 * TripSit Factsheets format (highly structured):
 * - ## Classification with **Categories:** and **Also known as:**
 * - ## Dosage with ### Route subsections
 * - ## Duration with labeled bullets
 * - ## Interactions with categorized sections (Dangerous, Caution, Low Risk)
 * - ## Effects as simple bullet list
 *
 * TripSit Wiki format (narrative + tables):
 * - Markdown tables for dosage/duration
 * - More narrative content
 */

import type {
  SourceParser,
  ParserResult,
  ParsedDosageRoute,
  ParsedDurationRoute,
  ParsedEffect,
  ParsedInteraction,
  ParsedTolerance,
  DoseRange,
  DurationRange,
} from "./types";

import {
  createEmptyParserResult,
  extractSection,
  extractSubsections,
  extractBulletList,
  extractLabeledBullets,
  parseDoseRange,
  parseDurationRange,
  normalizeRoute,
  detectInteractionSeverity,
  parseMarkdownTable,
  parseLabelValueTable,
  cleanMarkdown,
} from "./base";

// === Dosage Parsing ===

function parseDosageSection(content: string, sourceId: string): ParsedDosageRoute[] {
  const dosageSection = extractSection(content, "Dosage", 2);
  if (!dosageSection) return [];

  const routes: ParsedDosageRoute[] = [];
  const routeSubsections = extractSubsections(dosageSection, 3);

  for (const [routeName, routeContent] of routeSubsections) {
    const bullets = extractLabeledBullets(routeContent);
    const ranges: ParsedDosageRoute["ranges"] = {};

    // Extract unit from first valid dose
    let detectedUnit = "mg";
    for (const bullet of bullets) {
      const parsed = parseDoseRange(bullet.value);
      if (parsed?.unit) {
        detectedUnit = parsed.unit;
        break;
      }
    }

    for (const bullet of bullets) {
      const label = bullet.label.toLowerCase();
      const parsed = parseDoseRange(bullet.value);

      if (!parsed) continue;
      if (!parsed.unit) parsed.unit = detectedUnit;

      if (label.includes("threshold")) ranges.threshold = parsed;
      else if (label.includes("light")) ranges.light = parsed;
      else if (label.includes("common") || label.includes("moderate")) ranges.common = parsed;
      else if (label.includes("strong")) ranges.strong = parsed;
      else if (label.includes("heavy")) ranges.heavy = parsed;
    }

    // Extract notes
    const noteMatch = routeContent.match(/\*Note:\s*(.+?)\*/i);
    const notes = noteMatch ? noteMatch[1].trim() : undefined;

    if (Object.keys(ranges).length > 0) {
      routes.push({
        route: normalizeRoute(routeName),
        source: sourceId,
        confidence: "high",
        ranges,
        notes,
      });
    }
  }

  // Handle flat dosage section (no route subsections) - default to Oral
  if (routes.length === 0) {
    const bullets = extractLabeledBullets(dosageSection);
    if (bullets.length > 0) {
      const ranges: ParsedDosageRoute["ranges"] = {};
      let detectedUnit = "mg";

      for (const bullet of bullets) {
        const parsed = parseDoseRange(bullet.value);
        if (parsed?.unit) {
          detectedUnit = parsed.unit;
          break;
        }
      }

      for (const bullet of bullets) {
        const label = bullet.label.toLowerCase();
        const parsed = parseDoseRange(bullet.value);
        if (!parsed) continue;
        if (!parsed.unit) parsed.unit = detectedUnit;

        if (label.includes("threshold")) ranges.threshold = parsed;
        else if (label.includes("light")) ranges.light = parsed;
        else if (label.includes("common") || label.includes("moderate")) ranges.common = parsed;
        else if (label.includes("strong")) ranges.strong = parsed;
        else if (label.includes("heavy")) ranges.heavy = parsed;
      }

      if (Object.keys(ranges).length > 0) {
        routes.push({
          route: "Oral",
          source: sourceId,
          confidence: "medium",
          ranges,
        });
      }
    }
  }

  // Also try parsing markdown tables (TripSit Wiki style)
  const tableRoutes = parseDosageTable(dosageSection, sourceId);
  routes.push(...tableRoutes);

  return routes;
}

function parseDosageTable(content: string, sourceId: string): ParsedDosageRoute[] {
  const routes: ParsedDosageRoute[] = [];

  // Use label-value table parser for TripSit Wiki format
  // Format: | Light | 100-300μg | (each row is a label-value pair)
  const rows = parseLabelValueTable(content);
  if (rows.length === 0) return [];

  const ranges: ParsedDosageRoute["ranges"] = {};

  for (const [label, value] of rows) {
    const lowerLabel = label.toLowerCase();
    const parsed = parseDoseRange(value);

    if (!parsed) continue;

    if (lowerLabel.includes("threshold")) ranges.threshold = parsed;
    else if (lowerLabel.includes("light")) ranges.light = parsed;
    else if (lowerLabel.includes("common") || lowerLabel.includes("moderate")) ranges.common = parsed;
    else if (lowerLabel.includes("strong")) ranges.strong = parsed;
    else if (lowerLabel.includes("heavy")) ranges.heavy = parsed;
  }

  if (Object.keys(ranges).length > 0) {
    routes.push({
      route: "Oral",
      source: sourceId,
      confidence: "medium",
      ranges,
    });
  }

  return routes;
}

// === Duration Parsing ===

function parseDurationSection(content: string, sourceId: string): ParsedDurationRoute[] {
  const durationSection = extractSection(content, "Duration", 2);
  if (!durationSection) return [];

  const routes: ParsedDurationRoute[] = [];

  // First try route subsections
  const routeSubsections = extractSubsections(durationSection, 3);

  if (routeSubsections.size > 0) {
    for (const [routeName, routeContent] of routeSubsections) {
      const duration = parseDurationContent(routeContent, sourceId, routeName);
      if (duration) routes.push(duration);
    }
  } else {
    // Flat duration section
    const duration = parseDurationContent(durationSection, sourceId, "Oral");
    if (duration) routes.push(duration);
  }

  return routes;
}

/**
 * Parse Python dict-like duration format from TripSit:
 * "{'_unit': 'minutes', 'Insufflated': '10-15', 'Intravenous': '0-5'}"
 * Returns map of route -> parsed duration range
 */
function parseNestedDurationDict(
  value: string
): Map<string, { value: string; unit: string }> | null {
  // Check if this looks like a Python dict
  if (!value.includes("{") || !value.includes("'_unit'")) {
    return null;
  }

  const result = new Map<string, { value: string; unit: string }>();

  // Extract unit
  const unitMatch = value.match(/'_unit':\s*'([^']+)'/);
  const unit = unitMatch ? unitMatch[1] : "hours";

  // Extract route values: 'RouteName': 'value'
  const routePattern = /'([A-Za-z]+)':\s*'([^']+)'/g;
  let match;
  while ((match = routePattern.exec(value)) !== null) {
    const routeName = match[1];
    const routeValue = match[2];
    if (routeName !== "_unit") {
      result.set(routeName, { value: routeValue, unit });
    }
  }

  return result.size > 0 ? result : null;
}

/**
 * Parse inline multi-route duration format:
 * "Insufflated: 5-10, Intravenous: 0-2, Oral: 20-70 minutes"
 */
function parseInlineMultiRouteDuration(
  value: string
): Map<string, { value: string; unit: string }> | null {
  // Check for pattern like "Route: value, Route: value unit"
  if (!value.includes(":") || !value.includes(",")) {
    return null;
  }

  const result = new Map<string, { value: string; unit: string }>();

  // Extract trailing unit if present
  const unitMatch = value.match(/(minutes?|hours?|mins?|hrs?)$/i);
  const unit = unitMatch ? unitMatch[1] : "hours";

  // Split by comma and parse each
  const parts = value.split(",");
  for (const part of parts) {
    const routeMatch = part.match(/([A-Za-z]+):\s*([\d.-]+)/);
    if (routeMatch) {
      result.set(routeMatch[1], { value: routeMatch[2], unit });
    }
  }

  return result.size > 0 ? result : null;
}

function parseDurationContent(
  content: string,
  sourceId: string,
  routeName: string
): ParsedDurationRoute | null {
  const bullets = extractLabeledBullets(content);
  const stages: ParsedDurationRoute["stages"] = {};

  for (const bullet of bullets) {
    const label = bullet.label.toLowerCase();

    // First try to parse as Python dict format
    const dictParsed = parseNestedDurationDict(bullet.value);
    if (dictParsed) {
      // This contains multi-route data - use the routeName if specified, otherwise take first
      const routeData = dictParsed.get(routeName) || dictParsed.values().next().value;
      if (routeData) {
        const parsed = parseDurationRange(`${routeData.value} ${routeData.unit}`);
        if (parsed) {
          if (label.includes("onset")) stages.onset = parsed;
          else if (label.includes("duration") || label.includes("total")) stages.total = parsed;
          else if (label.includes("after")) stages.afterEffects = parsed;
        }
      }
      continue;
    }

    // Try inline multi-route format
    const inlineParsed = parseInlineMultiRouteDuration(bullet.value);
    if (inlineParsed) {
      const routeData = inlineParsed.get(routeName) || inlineParsed.values().next().value;
      if (routeData) {
        const parsed = parseDurationRange(`${routeData.value} ${routeData.unit}`);
        if (parsed) {
          if (label.includes("onset")) stages.onset = parsed;
          else if (label.includes("duration") || label.includes("total")) stages.total = parsed;
          else if (label.includes("after")) stages.afterEffects = parsed;
        }
      }
      continue;
    }

    // Standard format
    const parsed = parseDurationRange(bullet.value);
    if (!parsed) continue;

    if (label.includes("onset")) stages.onset = parsed;
    else if (label.includes("come up") || label.includes("comeup")) stages.comeUp = parsed;
    else if (label.includes("peak")) stages.peak = parsed;
    else if (label.includes("offset")) stages.offset = parsed;
    else if (label.includes("after") && label.includes("effect")) stages.afterEffects = parsed;
    else if (label.includes("duration") || label.includes("total")) stages.total = parsed;
  }

  // Also try label-value table (TripSit Wiki format)
  // Format: | Onset | 30-120 minutes | (each row is a label-value pair)
  const tableRows = parseLabelValueTable(content);
  for (const [label, value] of tableRows) {
    const lowerLabel = label.toLowerCase();
    const parsed = parseDurationRange(value);
    if (!parsed) continue;

    if (lowerLabel.includes("onset")) stages.onset = parsed;
    else if (lowerLabel.includes("come up") || lowerLabel.includes("comeup")) stages.comeUp = parsed;
    else if (lowerLabel.includes("peak")) stages.peak = parsed;
    else if (lowerLabel.includes("offset")) stages.offset = parsed;
    else if (lowerLabel.includes("after")) stages.afterEffects = parsed;
    else if (lowerLabel.includes("total") || lowerLabel.includes("duration")) stages.total = parsed;
  }

  if (Object.keys(stages).length > 0) {
    return {
      route: normalizeRoute(routeName),
      source: sourceId,
      confidence: "high",
      stages,
    };
  }

  return null;
}

// === Effects Parsing ===

/**
 * Validate and potentially truncate effect name
 * Returns null if the effect should be skipped entirely
 */
function validateEffectName(rawEffect: string): string | null {
  const effectName = cleanMarkdown(rawEffect).trim();

  // Skip empty effects
  if (!effectName || effectName.length < 3) return null;

  // Skip overly long entries (likely full sentences, not effect names)
  if (effectName.length > 100) {
    // Try to extract just the first part before any explanation
    const truncated = effectName.split(/[.!?;]/)[0].trim();
    if (truncated.length >= 3 && truncated.length <= 80) {
      return truncated;
    }
    // Skip if still too long or too short
    return null;
  }

  return effectName;
}

function parseEffectsSection(content: string, sourceId: string): ParsedEffect[] {
  const effectsSection = extractSection(content, "Effects", 2);
  if (!effectsSection) return [];

  const effects: ParsedEffect[] = [];

  // Check for categorized subsections (Positive, Neutral, Negative)
  const positiveSection = extractSection(effectsSection, "Positive", 3);
  const neutralSection = extractSection(effectsSection, "Neutral", 3);
  const negativeSection = extractSection(effectsSection, "Negative", 3);

  if (positiveSection) {
    for (const effect of extractBulletList(positiveSection)) {
      const validName = validateEffectName(effect);
      if (validName) {
        effects.push({
          name: validName,
          category: "positive",
          source: sourceId,
        });
      }
    }
  }

  if (neutralSection) {
    for (const effect of extractBulletList(neutralSection)) {
      const validName = validateEffectName(effect);
      if (validName) {
        effects.push({
          name: validName,
          category: "neutral",
          source: sourceId,
        });
      }
    }
  }

  if (negativeSection) {
    for (const effect of extractBulletList(negativeSection)) {
      const validName = validateEffectName(effect);
      if (validName) {
        effects.push({
          name: validName,
          category: "negative",
          source: sourceId,
        });
      }
    }
  }

  // If no subsections, parse flat list without category (don't infer)
  if (effects.length === 0) {
    for (const effect of extractBulletList(effectsSection)) {
      const validName = validateEffectName(effect);
      if (validName) {
        effects.push({
          name: validName,
          source: sourceId,
        });
      }
    }
  }

  return effects;
}

// === Interactions Parsing ===

function parseInteractionsSection(content: string, sourceId: string): ParsedInteraction[] {
  const interactionsSection = extractSection(content, "Interactions", 2);
  if (!interactionsSection) return [];

  const interactions: ParsedInteraction[] = [];

  // Parse categorized sections
  const categories = [
    { pattern: /dangerous/i, severity: "dangerous" as const },
    { pattern: /unsafe/i, severity: "unsafe" as const },
    { pattern: /caution/i, severity: "caution" as const },
    { pattern: /low risk.*synergy/i, severity: "low-risk-synergy" as const },
    { pattern: /low risk.*decrease/i, severity: "low-risk-decrease" as const },
    { pattern: /low risk.*no synergy/i, severity: "low-risk-no-synergy" as const },
  ];

  const subsections = extractSubsections(interactionsSection, 3);

  for (const [sectionName, sectionContent] of subsections) {
    let severity: ParsedInteraction["severity"] = "caution";

    for (const cat of categories) {
      if (cat.pattern.test(sectionName)) {
        severity = cat.severity;
        break;
      }
    }

    // Parse interaction items
    const lines = sectionContent.split("\n");
    for (const line of lines) {
      // Match "- **substance**: description" or "- **substance**" or "- substance"
      const match = line.match(/^\s*[-*]\s*\*?\*?([^*:]+)\*?\*?:?\s*(.*)?$/);
      if (match) {
        const substance = match[1].trim();
        const description = match[2]?.trim();

        if (substance && !substance.match(/^[-=]+$/)) {
          interactions.push({
            substance: cleanMarkdown(substance),
            severity,
            description: description ? cleanMarkdown(description) : undefined,
            source: sourceId,
          });
        }
      }
    }
  }

  // Also check for "Other" section with inline severity
  const otherSection = subsections.get("other");
  if (otherSection) {
    const lines = otherSection.split("\n");
    for (const line of lines) {
      // Match "- **substance** (severity)"
      const match = line.match(/^\s*[-*]\s*\*?\*?([^*()]+)\*?\*?\s*\(([^)]+)\)/);
      if (match) {
        const substance = match[1].trim();
        const severityHint = match[2].toLowerCase();

        interactions.push({
          substance: cleanMarkdown(substance),
          severity: detectInteractionSeverity(severityHint),
          source: sourceId,
        });
      }
    }
  }

  return interactions;
}

// === Tolerance Parsing ===

function parseToleranceSection(content: string, sourceId: string): ParsedTolerance | undefined {
  // Extract the Tolerance section as raw text for LLM processing
  const toleranceSection = extractSection(content, "Tolerance", 2);
  if (!toleranceSection || toleranceSection.trim().length < 50) return undefined;

  const cleanedText = toleranceSection
    .replace(/\s+/g, " ")
    .trim();

  return {
    rawText: cleanedText,
    source: sourceId,
  };
}

// === Classification/Metadata Parsing ===

interface ClassificationData {
  categories: string[];
  aliases: string[];
}

function parseClassificationSection(content: string): ClassificationData {
  const classSection = extractSection(content, "Classification", 2);
  if (!classSection) return { categories: [], aliases: [] };

  const result: ClassificationData = { categories: [], aliases: [] };
  const bullets = extractLabeledBullets(classSection);

  for (const bullet of bullets) {
    const label = bullet.label.toLowerCase();

    if (label.includes("categories") || label.includes("category")) {
      result.categories = bullet.value.split(/[,;]/).map((s) => s.trim());
    } else if (label.includes("also known") || label.includes("aliases")) {
      result.aliases = bullet.value.split(/[,;]/).map((s) => s.trim());
    }
  }

  return result;
}

// === Summary/Notes Parsing ===

function parseSummarySection(content: string, sourceId: string): string | undefined {
  const summarySection = extractSection(content, "Summary", 2);
  if (!summarySection) return undefined;

  return cleanMarkdown(summarySection);
}

// === Narrative Extraction Helpers ===

/**
 * Extract introductory paragraphs (content before first ## header)
 */
function parseIntroductoryParagraphs(content: string, sourceId: string): string | undefined {
  // Find content before the first ## header
  const firstHeaderMatch = content.match(/^([\s\S]*?)(?=\n##\s)/);
  if (!firstHeaderMatch) return undefined;

  // Clean and filter - keep substantial paragraphs
  const intro = cleanMarkdown(firstHeaderMatch[1]).trim();
  // Must have substantial content (not just title/source lines)
  if (intro.length > 100 && !intro.startsWith("#") && !intro.startsWith("*Source:")) {
    return intro;
  }
  return undefined;
}

/**
 * Extract External Links section as narrative
 */
function parseExternalLinksSection(content: string, sourceId: string): string | undefined {
  const linksSection = extractSection(content, "External Links", 2);
  if (linksSection && linksSection.length > 30) {
    return cleanMarkdown(linksSection);
  }
  return undefined;
}

/**
 * Extract Chemistry and Pharmacology section narrative
 */
function parseChemistryPharmacologySection(content: string, sourceId: string): string | undefined {
  const chemSection = extractSection(content, "Chemistry and Pharmacology", 2) ||
                      extractSection(content, "Chemistry", 2) ||
                      extractSection(content, "Pharmacology", 2);
  if (chemSection && chemSection.length > 50) {
    return cleanMarkdown(chemSection);
  }
  return undefined;
}

/**
 * Extract After Effects narrative (prose, not just duration data)
 */
function parseAfterEffectsNarrative(content: string, sourceId: string): string | undefined {
  // Look for "After effects" or "After-effects" subsection
  const afterSection = extractSection(content, "After effects", 3) ||
                       extractSection(content, "After-effects", 3);
  if (afterSection && afterSection.length > 50) {
    return cleanMarkdown(afterSection);
  }
  return undefined;
}

/**
 * Extract prose content from Harm Reduction section (before bullet list)
 */
function parseHarmReductionProse(content: string, sourceId: string): string | undefined {
  const harmSection = extractSection(content, "Harm Reduction", 2);
  if (!harmSection) return undefined;

  // Get content before first bullet point
  const firstBulletIndex = harmSection.search(/^[-*]\s/m);
  if (firstBulletIndex <= 0) return undefined;

  const prose = harmSection.slice(0, firstBulletIndex).trim();
  if (prose.length > 50) {
    return cleanMarkdown(prose);
  }
  return undefined;
}

// === Main Parser ===

export class TripSitFactsheetsParser implements SourceParser {
  sourceId = "tripsit-factsheets";

  parse(content: string, substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // Parse all sections
    result.dosage = parseDosageSection(content, this.sourceId);
    result.duration = parseDurationSection(content, this.sourceId);
    result.effects = parseEffectsSection(content, this.sourceId);
    result.interactions = parseInteractionsSection(content, this.sourceId);
    result.tolerance = parseToleranceSection(content, this.sourceId);

    // Track extracted sections
    if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");
    if (result.duration.length > 0) result.sectionsExtracted.push("duration");
    if (result.effects.length > 0) result.sectionsExtracted.push("effects");
    if (result.interactions.length > 0) result.sectionsExtracted.push("interactions");
    if (result.tolerance) result.sectionsExtracted.push("tolerance");

    // Parse classification for metadata
    const classification = parseClassificationSection(content);
    if (classification.categories.length > 0 || classification.aliases.length > 0) {
      result.sectionsExtracted.push("classification");
    }

    // === Narrative content extraction ===

    // Parse summary as narrative content (if exists)
    const summary = parseSummarySection(content, this.sourceId);
    if (summary) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "summary",
        content: summary,
      });
      result.sectionsExtracted.push("summary");
    }

    // Extract External Links section
    const externalLinks = parseExternalLinksSection(content, this.sourceId);
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

export class TripSitWikiParser implements SourceParser {
  sourceId = "tripsit-wiki";

  parse(content: string, substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // TripSit Wiki often has similar structure but more narrative
    result.dosage = parseDosageSection(content, this.sourceId);
    result.duration = parseDurationSection(content, this.sourceId);
    result.effects = parseEffectsSection(content, this.sourceId);
    result.interactions = parseInteractionsSection(content, this.sourceId);
    result.tolerance = parseToleranceSection(content, this.sourceId);

    // Track extracted sections
    if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");
    if (result.duration.length > 0) result.sectionsExtracted.push("duration");
    if (result.effects.length > 0) result.sectionsExtracted.push("effects");
    if (result.interactions.length > 0) result.sectionsExtracted.push("interactions");
    if (result.tolerance) result.sectionsExtracted.push("tolerance");

    // === Narrative content extraction ===

    // Parse introductory paragraphs (substance overview)
    const intro = parseIntroductoryParagraphs(content, this.sourceId);
    if (intro) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "introduction",
        content: intro,
      });
      result.sectionsExtracted.push("introduction");
    }

    // Parse History section as narrative
    const historySection = extractSection(content, "History", 2);
    if (historySection) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "history",
        content: cleanMarkdown(historySection),
      });
      result.sectionsExtracted.push("history");
    }

    // Parse Chemistry and Pharmacology section
    const chemPharmNarrative = parseChemistryPharmacologySection(content, this.sourceId);
    if (chemPharmNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "chemistry_pharmacology",
        content: chemPharmNarrative,
      });
      result.sectionsExtracted.push("chemistry_pharmacology");
    }

    // Parse After Effects narrative
    const afterEffects = parseAfterEffectsNarrative(content, this.sourceId);
    if (afterEffects) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "after_effects",
        content: afterEffects,
      });
    }

    // Parse Harm Reduction prose (preamble before bullet list)
    const harmProse = parseHarmReductionProse(content, this.sourceId);
    if (harmProse) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "harm_reduction_overview",
        content: harmProse,
      });
    }

    // Parse Harm Reduction section for structured rules
    const harmSection = extractSection(content, "Harm Reduction", 2);
    if (harmSection) {
      const rules = extractBulletList(harmSection);
      if (rules.length > 0) {
        result.harmReduction = {
          rules: rules.map(cleanMarkdown),
          sources: [this.sourceId],
        };
        result.sectionsExtracted.push("harm_reduction");
      }
    }

    return result;
  }
}

// Export both parsers
export const tripsitFactsheetsParser = new TripSitFactsheetsParser();
export const tripsitWikiParser = new TripSitWikiParser();
