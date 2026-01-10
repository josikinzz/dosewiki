/**
 * PsychonautWiki Parser
 * Most comprehensive source with detailed dosage, duration, effects taxonomy
 *
 * Format:
 * - ## Dosage & Duration with ### Route subsections
 * - **Dosage:** / **Duration:** labeled sections within routes
 * - ## Subjective effects with ### Category (Physical, Visual, Cognitive, Auditory)
 * - #### Visual subsections (Enhancements, Distortions, Geometry, Hallucinatory)
 * - ## Toxicity and harm potential with ### Dangerous interactions
 * - ## Legal status with - **Country**: status bullets
 * - ## Pharmacology / ## Chemistry narrative sections
 */

import type {
  SourceParser,
  ParserResult,
  ParsedDosageRoute,
  ParsedDurationRoute,
  ParsedEffect,
  ParsedInteraction,
  ParsedLegalStatus,
  ParsedInternationalLaw,
  ParsedTolerance,
  ParsedPharmacology,
  ParsedChemistry,
  ParsedHarmReduction,
} from "./types";

import {
  createEmptyParserResult,
  extractSection,
  extractSubsections,
  extractBulletList,
  parseDoseRange,
  parseDurationRange,
  normalizeRoute,
  normalizeCountry,
  cleanMarkdown,
  stripMarkdownLinks,
  stripReferences,
  extractStatusAndNotes,
} from "./base";

// === Dosage & Duration Parsing ===

function parseDosageAndDuration(
  content: string,
  sourceId: string
): { dosage: ParsedDosageRoute[]; duration: ParsedDurationRoute[] } {
  const section = extractSection(content, "Dosage & Duration", 2);
  if (!section) return { dosage: [], duration: [] };

  const dosageRoutes: ParsedDosageRoute[] = [];
  const durationRoutes: ParsedDurationRoute[] = [];

  // Get route subsections (### Oral, ### Insufflated, etc.)
  const routeSubsections = extractSubsections(section, 3);

  for (const [routeName, routeContent] of routeSubsections) {
    // Parse **Dosage:** section
    const dosageMatch = routeContent.match(
      /\*\*Dosage:\*\*[\s\S]*?(?=\*\*Duration:\*\*|$)/i
    );
    if (dosageMatch) {
      const dosageData = parseDosageContent(dosageMatch[0], sourceId, routeName);
      if (dosageData) dosageRoutes.push(dosageData);
    }

    // Parse **Duration:** section
    const durationMatch = routeContent.match(/\*\*Duration:\*\*[\s\S]*/i);
    if (durationMatch) {
      const durationData = parseDurationContent(durationMatch[0], sourceId, routeName);
      if (durationData) durationRoutes.push(durationData);
    }
  }

  return { dosage: dosageRoutes, duration: durationRoutes };
}

function parseDosageContent(
  content: string,
  sourceId: string,
  routeName: string
): ParsedDosageRoute | null {
  const ranges: ParsedDosageRoute["ranges"] = {};
  const lines = content.split("\n");

  // Look for bioavailability
  let bioavailability: string | undefined;
  const bioMatch = content.match(/Bioavailability:\s*([^\n]+)/i);
  if (bioMatch) {
    bioavailability = cleanMarkdown(bioMatch[1]);
  }

  // Parse dose lines: "- Threshold: 20 mg" or "- Light: 20 - 80 mg"
  for (const line of lines) {
    const match = line.match(/^-\s*(Threshold|Light|Common|Strong|Heavy):\s*(.+)$/i);
    if (match) {
      const category = match[1].toLowerCase();
      const doseStr = match[2].trim();
      const parsed = parseDoseRange(doseStr);

      if (parsed) {
        if (category === "threshold") ranges.threshold = parsed;
        else if (category === "light") ranges.light = parsed;
        else if (category === "common") ranges.common = parsed;
        else if (category === "strong") ranges.strong = parsed;
        else if (category === "heavy") ranges.heavy = parsed;
      }
    }
  }

  if (Object.keys(ranges).length > 0) {
    return {
      route: normalizeRoute(routeName),
      source: sourceId,
      confidence: "high",
      bioavailability,
      ranges,
    };
  }

  return null;
}

function parseDurationContent(
  content: string,
  sourceId: string,
  routeName: string
): ParsedDurationRoute | null {
  const stages: ParsedDurationRoute["stages"] = {};
  const lines = content.split("\n");

  // Parse duration lines: "- Total: 3 - 6 hours" or "- Onset: 30 - 45 minutes"
  for (const line of lines) {
    const match = line.match(
      /^-\s*(Total|Onset|Come\s*up|Peak|Offset|After\s*effects):\s*(.+)$/i
    );
    if (match) {
      const stage = match[1].toLowerCase().replace(/\s+/g, "");
      const durationStr = match[2].trim();
      const parsed = parseDurationRange(durationStr);

      if (parsed) {
        if (stage === "total") stages.total = parsed;
        else if (stage === "onset") stages.onset = parsed;
        else if (stage === "comeup") stages.comeUp = parsed;
        else if (stage === "peak") stages.peak = parsed;
        else if (stage === "offset") stages.offset = parsed;
        else if (stage === "aftereffects") stages.afterEffects = parsed;
      }
    }
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

// === Subjective Effects Parsing ===

function parseSubjectiveEffects(content: string, sourceId: string): ParsedEffect[] {
  const section = extractSection(content, "Subjective effects", 2);
  if (!section) return [];

  const effects: ParsedEffect[] = [];

  // Parse Physical effects
  const physicalSection = extractSection(section, "Physical effects", 3);
  if (physicalSection) {
    effects.push(...parseEffectList(physicalSection, sourceId, "physical"));
  }

  // Parse Visual effects
  const visualSection = extractSection(section, "Visual effects", 3);
  if (visualSection) {
    // Visual has subsections: Enhancements, Distortions, Geometry, Hallucinatory
    const visualEffects = parseEffectList(visualSection, sourceId, "visual");
    effects.push(...visualEffects);
  }

  // Parse Cognitive effects
  const cognitiveSection = extractSection(section, "Cognitive effects", 3);
  if (cognitiveSection) {
    effects.push(...parseEffectList(cognitiveSection, sourceId, "cognitive"));
  }

  // Parse Auditory effects
  const auditorySection = extractSection(section, "Auditory effects", 3);
  if (auditorySection) {
    effects.push(...parseEffectList(auditorySection, sourceId, "auditory"));
  }

  return effects;
}

function parseEffectList(
  content: string,
  sourceId: string,
  category: string
): ParsedEffect[] {
  const effects: ParsedEffect[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    // Match "- **[Effect name](url)**" or "- **[Effect name](url)** - description"
    // Also match "- - **[Effect name](url)**" (double dash common in PWiki)
    const match = line.match(
      /^\s*-\s*-?\s*\*\*\[([^\]]+)\]\([^)]+\)\*\*(?:\s*-\s*(.+))?$/
    );
    if (match) {
      const effectName = cleanMarkdown(match[1]);
      const description = match[2] ? stripReferences(cleanMarkdown(match[2])) : undefined;

      effects.push({
        name: effectName,
        description,
        source: sourceId,
      });
    }

    // Also match simple bold format "- **Effect name**"
    const simpleMatch = line.match(/^\s*-\s*-?\s*\*\*([^*[\]]+)\*\*/);
    if (simpleMatch && !match) {
      const effectName = cleanMarkdown(simpleMatch[1]);
      effects.push({
        name: effectName,
        source: sourceId,
      });
    }
  }

  return effects;
}

// === Toxicity / Harm Potential / Interactions ===

function parseToxicitySection(
  content: string,
  sourceId: string
): {
  interactions: ParsedInteraction[];
  harmReduction: ParsedHarmReduction | undefined;
} {
  const section = extractSection(content, "Toxicity and harm potential", 2);
  if (!section) return { interactions: [], harmReduction: undefined };

  const interactions: ParsedInteraction[] = [];

  // Parse Dangerous interactions
  // Try level 3 first (most common), then level 4 (used by LSD, quetiapine)
  let dangerousSection = extractSection(section, "Dangerous interactions", 3);
  if (!dangerousSection) {
    dangerousSection = extractSection(section, "Dangerous interactions", 4);
  }
  if (dangerousSection) {
    const lines = dangerousSection.split("\n");
    for (const line of lines) {
      // Match "- **Substance** - description", "- **Substance** : description", or "- **Substance**"
      // Supports both dash (-/–/—) and colon (:) as separators (PsychonautWiki uses both)
      // Substance may be a link: "- **[Name](url)** - description"
      const match = line.match(/^\s*-\s*\*\*([^*]+)\*\*(?:\s*(?:[-–—:])\s*(.+))?$/);
      if (match) {
        const substance = cleanMarkdown(match[1]);
        const description = match[2] ? stripReferences(cleanMarkdown(match[2])) : undefined;

        // Skip headers like "Warning:" and filter invalid substances
        if (!substance.toLowerCase().includes("warning") && substance.length > 0 && substance.length < 100) {
          interactions.push({
            substance,
            severity: "dangerous",
            description,
            source: sourceId,
          });
        }
      }
    }
  }

  // Parse Serotonin syndrome risk
  const serotoninSection = extractSection(section, "Serotonin syndrome risk", 3);
  if (serotoninSection) {
    const lines = serotoninSection.split("\n");
    for (const line of lines) {
      // Same pattern as dangerous interactions - supports both : and - separators
      const match = line.match(/^\s*-\s*\*\*([^*]+)\*\*(?:\s*(?:[-–—:])\s*(.+))?$/);
      if (match) {
        const substance = cleanMarkdown(match[1]);
        const description = match[2] ? stripReferences(cleanMarkdown(match[2])) : undefined;

        if (!substance.toLowerCase().includes("maoi") && substance.length > 0 && substance.length < 100) {
          interactions.push({
            substance,
            severity: "dangerous",
            description: description || "Serotonin syndrome risk",
            source: sourceId,
          });
        }
      }
    }
  }

  // Extract harm reduction from section intro
  const harmRules: string[] = [];
  const risks: string[] = [];

  // Extract bullet points from main section (before subsections)
  const introMatch = section.match(/^[\s\S]*?(?=###|$)/);
  if (introMatch) {
    const bullets = extractBulletList(introMatch[0]);
    for (const bullet of bullets) {
      const cleaned = stripReferences(cleanMarkdown(bullet));
      if (cleaned.length > 10 && cleaned.length < 500) {
        if (
          cleaned.toLowerCase().includes("advised") ||
          cleaned.toLowerCase().includes("recommend") ||
          cleaned.toLowerCase().includes("should")
        ) {
          harmRules.push(cleaned);
        } else {
          risks.push(cleaned);
        }
      }
    }
  }

  const harmReduction: ParsedHarmReduction | undefined =
    harmRules.length > 0 || risks.length > 0
      ? {
          rules: harmRules,
          shortTermRisks: risks,
          sources: [sourceId],
        }
      : undefined;

  return { interactions, harmReduction };
}

// === Legal Status Parsing ===

interface LegalParseResult {
  legal: ParsedLegalStatus[];
  internationalLaw: ParsedInternationalLaw[];
}

function parseLegalStatus(content: string, sourceId: string): LegalParseResult {
  const section = extractSection(content, "Legal status", 2);
  if (!section) return { legal: [], internationalLaw: [] };

  const statuses: ParsedLegalStatus[] = [];
  const treaties: ParsedInternationalLaw[] = [];

  // === Extract UN Conventions from intro paragraph ===
  // The intro paragraph is before the first bullet point
  const introMatch = section.match(/^([\s\S]*?)(?=\n\s*-\s*\*\*)/);
  const intro = introMatch ? introMatch[1] : section;

  if (intro.includes("1971 Convention") || intro.includes("Convention on Psychotropic Substances")) {
    treaties.push({
      treaty: "UN Convention on Psychotropic Substances 1971",
      source: sourceId,
    });
  }
  if (intro.includes("1961 Convention") || intro.includes("Single Convention on Narcotic")) {
    treaties.push({
      treaty: "Single Convention on Narcotic Drugs 1961",
      source: sourceId,
    });
  }
  if (intro.includes("1988 Convention") || intro.includes("Against Illicit Traffic")) {
    treaties.push({
      treaty: "UN Convention Against Illicit Traffic 1988",
      source: sourceId,
    });
  }

  // === Parse country entries ===
  const lines = section.split("\n");

  for (const line of lines) {
    // Match "- **Country**: status" or "- **Country** : status"
    const match = line.match(/^\s*-\s*\*\*([^*:]+)\*\*\s*:\s*(.+)$/);
    if (match) {
      const country = normalizeCountry(match[1].trim());
      const fullText = stripReferences(cleanMarkdown(match[2]));

      if (fullText.length > 0 && fullText.length < 1000) {
        const { status, notes } = extractStatusAndNotes(fullText);
        statuses.push({
          country,
          status,
          details: notes || undefined,
          source: sourceId,
        });
      }
    }
  }

  return { legal: statuses, internationalLaw: treaties };
}

// === Tolerance Parsing ===

function parseTolerance(content: string, sourceId: string): ParsedTolerance | undefined {
  // PsychonautWiki often has tolerance info in Toxicity section or standalone
  const tolerancePatterns = [
    /tolerance.*?develops.*?(\d+[\s-]*\d*\s*(?:days?|weeks?|months?))/i,
    /full\s*tolerance.*?(\d+[\s-]*\d*\s*(?:days?|weeks?|months?))/i,
    /half\s*tolerance.*?(\d+[\s-]*\d*\s*(?:days?|weeks?|months?))/i,
    /baseline.*?(\d+[\s-]*\d*\s*(?:days?|weeks?|months?))/i,
  ];

  const tolerance: ParsedTolerance = { source: sourceId };
  let foundAny = false;

  for (const pattern of tolerancePatterns) {
    const match = content.match(pattern);
    if (match) {
      const timeframe = match[1];
      const fullText = match[0].toLowerCase();

      if (fullText.includes("full")) {
        tolerance.fullTolerance = timeframe;
        foundAny = true;
      } else if (fullText.includes("half")) {
        tolerance.halfTolerance = timeframe;
        foundAny = true;
      } else if (fullText.includes("baseline")) {
        tolerance.baselineTolerance = timeframe;
        foundAny = true;
      }
    }
  }

  // Look for cross-tolerance mentions
  // Pre-strip markdown links to avoid URL periods causing truncation
  const contentWithoutLinks = stripMarkdownLinks(content);
  const crossMatch = contentWithoutLinks.match(/cross[- ]?tolerance.*?(?:with|to)\s+([^.]+)/i);
  if (crossMatch) {
    tolerance.crossTolerances = crossMatch[1]
      .split(/,|and/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 100);
    foundAny = true;
  }

  return foundAny ? tolerance : undefined;
}

// === Chemistry/Pharmacology Parsing ===

function parseChemistry(content: string, sourceId: string): Partial<ParsedChemistry> | undefined {
  const section = extractSection(content, "Chemistry", 2);
  if (!section) return undefined;

  const chemistry: Partial<ParsedChemistry> = { sources: [sourceId] };

  // Look for SMILES
  const smilesMatch = section.match(/SMILES[:\s]*`?([^`\n]+)`?/i);
  if (smilesMatch) chemistry.smiles = smilesMatch[1].trim();

  // Look for IUPAC (validate length to filter out placeholder values like "s")
  const iupacMatch = section.match(/IUPAC[:\s]*`?([^`\n]+)`?/i);
  if (iupacMatch && iupacMatch[1].trim().length >= 5) {
    chemistry.iupac = iupacMatch[1].trim();
  }

  // Look for molecular formula
  const formulaMatch = section.match(/(?:molecular\s*)?formula[:\s]*`?([^`\n]+)`?/i);
  if (formulaMatch) chemistry.formula = formulaMatch[1].trim();

  // Look for molecular weight
  const weightMatch = section.match(/(?:molecular\s*)?weight[:\s]*`?([^`\n]+)`?/i);
  if (weightMatch) chemistry.molecularWeight = weightMatch[1].trim();

  return Object.keys(chemistry).length > 1 ? chemistry : undefined;
}

/**
 * Extract narrative paragraphs from a section (exclude bullet lists and headers)
 */
function extractNarrativeParagraphs(section: string): string {
  const lines = section.split("\n");
  const narrativeLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headers, bullets, empty lines, and metadata lines
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("|") ||
      trimmed === "" ||
      /^(SMILES|IUPAC|Formula|Weight|Bioavailability)[:\s]/i.test(trimmed)
    ) {
      continue;
    }
    // Include paragraph lines (substantial text)
    if (trimmed.length > 20) {
      narrativeLines.push(trimmed);
    }
  }

  return narrativeLines.join("\n\n");
}

/**
 * Extract Chemistry section narrative (structure descriptions, analog info, stability)
 */
function parseChemistryNarrative(content: string, sourceId: string): string | undefined {
  const section = extractSection(content, "Chemistry", 2);
  if (!section) return undefined;

  const narrative = extractNarrativeParagraphs(section);
  if (narrative.length > 50) {
    return stripReferences(cleanMarkdown(narrative));
  }
  return undefined;
}

/**
 * Extract Pharmacology section narrative (mechanism descriptions, flashbacks, research)
 */
function parsePharmacologyNarrative(content: string, sourceId: string): string | undefined {
  const section = extractSection(content, "Pharmacology", 2);
  if (!section) return undefined;

  // Get main narrative paragraphs
  const mainNarrative = extractNarrativeParagraphs(section);

  // Also extract any subsections (like "Flashbacks") as separate narratives
  const subsectionMatch = section.match(/###\s*(.+)/g);
  const subsectionNarratives: string[] = [];

  if (subsectionMatch) {
    for (const match of subsectionMatch) {
      const subsectionName = match.replace(/^###\s*/, "").trim();
      const subsection = extractSection(section, subsectionName, 3);
      if (subsection) {
        const subNarrative = extractNarrativeParagraphs(subsection);
        if (subNarrative.length > 50) {
          subsectionNarratives.push(`[${subsectionName}]\n${subNarrative}`);
        }
      }
    }
  }

  const combined = [mainNarrative, ...subsectionNarratives].filter(Boolean).join("\n\n");
  if (combined.length > 50) {
    return stripReferences(cleanMarkdown(combined));
  }
  return undefined;
}

/**
 * Extract Forms section (distribution methods, administration)
 */
function parseFormsSection(content: string, sourceId: string): string | undefined {
  const section = extractSection(content, "Forms", 2);
  if (!section) return undefined;

  // Extract both narrative paragraphs and bullet points (forms are often listed)
  const cleaned = stripReferences(cleanMarkdown(section));
  if (cleaned.length > 50) {
    return cleaned;
  }
  return undefined;
}

/**
 * Extract Research section (therapeutic applications, clinical trials)
 */
function parseResearchSection(content: string, sourceId: string): string | undefined {
  const section = extractSection(content, "Research", 2);
  if (!section) return undefined;

  const cleaned = stripReferences(cleanMarkdown(section));
  if (cleaned.length > 50) {
    return cleaned;
  }
  return undefined;
}

/**
 * Extract introductory paragraphs from PsychonautWiki articles
 * These appear after the Dosage & Duration structured data, before the next major section
 */
function parseIntroductoryParagraphs(content: string, sourceId: string): string | undefined {
  // Find the Dosage & Duration section
  const dosageStart = content.indexOf("## Dosage & Duration");
  if (dosageStart === -1) return undefined;

  // Get content from dosage section start
  const fromDosage = content.slice(dosageStart);

  // Find the next ## section after Dosage & Duration
  const nextSectionMatch = fromDosage.match(/\n## (?!Dosage)/);
  if (!nextSectionMatch) return undefined;

  const dosageSection = fromDosage.slice(0, nextSectionMatch.index);

  // The intro paragraphs come after the structured Duration data
  // Look for the pattern where narrative begins (after Duration block, typically starts with **)
  // Common patterns:
  // 1. **SubstanceName** (also known as...
  // 2. **SubstanceName** is a...
  // 3. SubstanceName is a... (without bold)

  // Find where structured data ends - after the last Duration/Onset/etc line
  const durationEndPatterns = [
    /\*\*After effects:\*\*[^\n]+\n/gi,
    /- After effects:[^\n]+\n/gi,
    /\*\*Duration:\*\*[^\n]+\n/gi,
    /- Total:[^\n]+\n/gi,
  ];

  let lastStructuredEnd = 0;
  for (const pattern of durationEndPatterns) {
    let match;
    while ((match = pattern.exec(dosageSection)) !== null) {
      const end = match.index + match[0].length;
      if (end > lastStructuredEnd) lastStructuredEnd = end;
    }
  }

  if (lastStructuredEnd === 0) {
    // Fallback: look for the narrative start pattern
    const narrativeMatch = dosageSection.search(/\n\n\*\*[A-Z]|\n\n[A-Z][a-z]+ is a /);
    if (narrativeMatch > 0) lastStructuredEnd = narrativeMatch;
  }

  if (lastStructuredEnd === 0) return undefined;

  const introParagraphs = dosageSection.slice(lastStructuredEnd).trim();
  const cleaned = stripReferences(cleanMarkdown(introParagraphs));

  if (cleaned.length > 100) {
    return cleaned;
  }
  return undefined;
}

/**
 * Extract subjective effects intro paragraph (comparative description before effects list)
 */
function parseSubjectiveEffectsIntro(content: string, sourceId: string): string | undefined {
  const section = extractSection(content, "Subjective effects", 2);
  if (!section) return undefined;

  // Get content before the first ### subsection (Physical effects, etc.)
  const firstSubsection = section.indexOf("### ");
  if (firstSubsection === -1) return undefined;

  const introContent = section.slice(0, firstSubsection);
  const narrative = extractNarrativeParagraphs(introContent);

  if (narrative.length > 50) {
    return stripReferences(cleanMarkdown(narrative));
  }
  return undefined;
}

function parsePharmacology(
  content: string,
  sourceId: string
): Partial<ParsedPharmacology> | undefined {
  const section = extractSection(content, "Pharmacology", 2);
  if (!section) return undefined;

  const pharmacology: Partial<ParsedPharmacology> = { sources: [sourceId] };

  // Look for half-life
  const halfLifeMatch = section.match(/half[- ]?life[:\s]+of?\s*([^.]+)/i);
  if (halfLifeMatch) pharmacology.halfLife = cleanMarkdown(halfLifeMatch[1]);

  // Look for bioavailability
  const bioMatch = section.match(/bioavailability[:\s]+of?\s*([^.]+)/i);
  if (bioMatch) pharmacology.bioavailability = cleanMarkdown(bioMatch[1]);

  // Look for mechanism mentions
  // Pre-strip markdown links to avoid URL periods causing truncation
  const sectionWithoutLinks = stripMarkdownLinks(section);
  const mechanisms: string[] = [];
  const mechanismPatterns = [
    /acts?\s+as\s+(?:an?\s+)?([^.]+(?:agonist|antagonist|inhibitor|reuptake))/gi,
    /(?:agonist|antagonist|inhibitor)\s+(?:at|of)\s+([^.]+)/gi,
  ];

  for (const pattern of mechanismPatterns) {
    let match;
    while ((match = pattern.exec(sectionWithoutLinks)) !== null) {
      mechanisms.push(match[1].trim());
    }
  }

  if (mechanisms.length > 0) {
    pharmacology.mechanismOfAction = mechanisms;
  }

  // Extract receptor information
  const receptors: Array<{ name: string; action: string }> = [];
  const receptorMatch = section.matchAll(
    /(\d+-HT\s*\d*[A-Z]?|dopamine|serotonin|norepinephrine|GABA|glutamate|NMDA|opioid|cannabinoid)\s+(?:receptor)?\s*(agonist|antagonist|inhibitor|partial\s+agonist)/gi
  );
  for (const match of receptorMatch) {
    receptors.push({
      name: match[1],
      action: match[2],
    });
  }

  if (receptors.length > 0) {
    pharmacology.receptors = receptors;
  }

  return Object.keys(pharmacology).length > 1 ? pharmacology : undefined;
}

// === Main Parser ===

export class PsychonautWikiParser implements SourceParser {
  sourceId = "psychonautwiki";

  parse(content: string, substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // Parse dosage and duration
    const { dosage, duration } = parseDosageAndDuration(content, this.sourceId);
    result.dosage = dosage;
    result.duration = duration;

    // Parse subjective effects
    result.effects = parseSubjectiveEffects(content, this.sourceId);

    // Parse toxicity/interactions/harm reduction
    const { interactions, harmReduction } = parseToxicitySection(content, this.sourceId);
    result.interactions = interactions;
    result.harmReduction = harmReduction;

    // Parse legal status
    const legalResult = parseLegalStatus(content, this.sourceId);
    result.legal = legalResult.legal;
    result.internationalLaw = legalResult.internationalLaw;

    // Parse tolerance
    result.tolerance = parseTolerance(content, this.sourceId);

    // Parse chemistry
    result.chemistry = parseChemistry(content, this.sourceId);

    // Parse pharmacology
    result.pharmacology = parsePharmacology(content, this.sourceId);

    // Track extracted sections
    if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");
    if (result.duration.length > 0) result.sectionsExtracted.push("duration");
    if (result.effects.length > 0) result.sectionsExtracted.push("effects");
    if (result.interactions.length > 0) result.sectionsExtracted.push("interactions");
    if (result.legal.length > 0) result.sectionsExtracted.push("legal");
    if (result.internationalLaw.length > 0) result.sectionsExtracted.push("international_law");
    if (result.tolerance) result.sectionsExtracted.push("tolerance");
    if (result.chemistry) result.sectionsExtracted.push("chemistry");
    if (result.pharmacology) result.sectionsExtracted.push("pharmacology");
    if (result.harmReduction) result.sectionsExtracted.push("harm_reduction");

    // === Preserve narrative content (no truncation) ===

    // History and culture (full section, no truncation)
    const historySection = extractSection(content, "History and culture", 2);
    if (historySection) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "history",
        content: stripReferences(cleanMarkdown(historySection)),
      });
      result.sectionsExtracted.push("history");
    }

    // Introduction (paragraphs after dosage/duration, before history)
    const introNarrative = parseIntroductoryParagraphs(content, this.sourceId);
    if (introNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "introduction",
        content: introNarrative,
      });
      result.sectionsExtracted.push("introduction");
    }

    // Chemistry narrative (structure descriptions, analog families, stability)
    const chemistryNarrative = parseChemistryNarrative(content, this.sourceId);
    if (chemistryNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "chemistry",
        content: chemistryNarrative,
      });
      // Note: chemistry structured data tracked separately
    }

    // Pharmacology narrative (mechanism descriptions, flashbacks, gene expression)
    const pharmacologyNarrative = parsePharmacologyNarrative(content, this.sourceId);
    if (pharmacologyNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "pharmacology",
        content: pharmacologyNarrative,
      });
      // Note: pharmacology structured data tracked separately
    }

    // Subjective effects intro (comparative paragraph before effects list)
    const effectsIntro = parseSubjectiveEffectsIntro(content, this.sourceId);
    if (effectsIntro) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "effects_overview",
        content: effectsIntro,
      });
    }

    // Forms section (distribution methods, administration)
    const formsNarrative = parseFormsSection(content, this.sourceId);
    if (formsNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "forms",
        content: formsNarrative,
      });
      result.sectionsExtracted.push("forms");
    }

    // Research section (therapeutic applications, clinical trials)
    const researchNarrative = parseResearchSection(content, this.sourceId);
    if (researchNarrative) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "research",
        content: researchNarrative,
      });
      result.sectionsExtracted.push("research");
    }

    return result;
  }
}

export const psychonautWikiParser = new PsychonautWikiParser();
