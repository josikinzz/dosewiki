/**
 * Combined parsers for smaller/simpler source types:
 * - IsomerDesign (chemistry only)
 * - SaferParty (harm reduction focused)
 * - DEIS (Disregard Everything I Say - effects focus)
 * - Drug Users Bible (experience narratives)
 * - Drug Classroom (medical/clinical)
 * - Wikipedia (general info, pharmacology)
 */

import type {
  SourceParser,
  ParserResult,
  ParsedChemistry,
  ParsedPharmacology,
  ParsedDosageRoute,
  ParsedDurationRoute,
  ParsedEffect,
  ParsedLegalStatus,
  ParsedHarmReduction,
} from "./types";

import {
  createEmptyParserResult,
  extractSection,
  extractBulletList,
  extractLabeledBullets,
  parseDoseRange,
  parseDurationRange,
  normalizeRoute,
  normalizeCountry,
  cleanMarkdown,
  stripMarkdownLinks,
  stripReferences,
  detectInteractionSeverity,
} from "./base";

// ============================================
// ISOMER DESIGN PARSER
// ============================================

export class IsomerDesignParser implements SourceParser {
  sourceId = "isomerdesign";

  parse(content: string, substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // Isomer Design primarily provides chemistry data
    const chemistry: Partial<ParsedChemistry> = { sources: [this.sourceId] };

    // Parse **Label:** Value patterns
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
        // Validate IUPAC names - filter out placeholder values like "s"
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

    // Check for SYNTHESIS section (preserve as narrative - no truncation)
    const synthesisMatch = content.match(/## SYNTHESIS([\s\S]*?)(?=##|$)/i);
    if (synthesisMatch) {
      result.narrativeContent.synthesis.push({
        source: this.sourceId,
        content: cleanMarkdown(synthesisMatch[1]),
      });
      result.sectionsExtracted.push("synthesis");
    }

    // Check for QUALITATIVE COMMENTS (PiHKAL/TiHKAL) - no truncation, multiple trip reports
    const commentsMatch = content.match(/## QUALITATIVE COMMENTS([\s\S]*?)(?=##|$)/i);
    if (commentsMatch) {
      result.narrativeContent.qualitativeComments.push({
        source: this.sourceId,
        content: cleanMarkdown(commentsMatch[1]),
      });
      result.sectionsExtracted.push("qualitative_comments");
    }

    // Check for EXTENSIONS AND COMMENTARY (PiHKAL/TiHKAL - contains history, safety info, related compounds)
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

    // Parse DOSAGE if present
    const dosageMatch = content.match(/## DOSAGE\s*([\s\S]*?)(?=##|$)/i);
    if (dosageMatch) {
      const doseStr = cleanMarkdown(dosageMatch[1]);
      const parsed = parseDoseRange(doseStr);
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

    // Parse DURATION if present
    const durationMatch = content.match(/## DURATION\s*([\s\S]*?)(?=##|$)/i);
    if (durationMatch) {
      const durationStr = cleanMarkdown(durationMatch[1]);
      const parsed = parseDurationRange(durationStr);
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

// ============================================
// SAFER PARTY PARSER
// ============================================

export class SaferPartyParser implements SourceParser {
  sourceId = "saferparty";

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // SaferParty Effects section is narrative prose, NOT comma-separated effects
    // Splitting by commas produces garbage like "set and setting. As a hallucinogen"
    // Store as narrative content instead of trying to parse into effects array
    const effectsSection = extractSection(content, "Effects", 2);
    if (effectsSection) {
      const cleaned = cleanMarkdown(effectsSection).trim();
      if (cleaned.length > 20) {
        result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "effects",
          content: cleaned,  // No truncation
        });
        result.sectionsExtracted.push("effects_narrative");
      }
    }

    // Parse Risks section - no truncation for critical safety info
    const harmReduction: Partial<ParsedHarmReduction> = {
      rules: [],
      shortTermRisks: [],
      longTermRisks: [],
      sources: [this.sourceId],
    };

    const shortTermSection = extractSection(content, "Short-term Risks", 3);
    if (shortTermSection) {
      harmReduction.shortTermRisks = [cleanMarkdown(shortTermSection)];  // No truncation
    }

    const longTermSection = extractSection(content, "Long-term Risks", 3);
    if (longTermSection) {
      harmReduction.longTermRisks = [cleanMarkdown(longTermSection)];  // No truncation
    }

    // Parse Safer Use section (most valuable from this source)
    const saferUseSection = extractSection(content, "Safer Use", 2);
    if (saferUseSection) {
      harmReduction.rules = extractBulletList(saferUseSection).map(cleanMarkdown);
    }

    if (
      (harmReduction.rules?.length ?? 0) > 0 ||
      (harmReduction.shortTermRisks?.length ?? 0) > 0 ||
      (harmReduction.longTermRisks?.length ?? 0) > 0
    ) {
      result.harmReduction = harmReduction;
      result.sectionsExtracted.push("harm_reduction");
    }

    // Parse Dosage section (narrative, not structured)
    const dosageSection = extractSection(content, "Dosage", 2);
    if (dosageSection) {
      result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "dosage",
        content: cleanMarkdown(dosageSection),
      });
      result.sectionsExtracted.push("dosage_narrative");
    }

    // Parse Adulterants & Extenders section (~50% of SaferParty files have this)
    // Contains valuable harm reduction info about contaminants and misdeclared substances
    const adulterantsSection = extractSection(content, "Adulterants & Extenders", 2);
    if (adulterantsSection) {
      const cleaned = cleanMarkdown(adulterantsSection).trim();
      if (cleaned.length > 50) {
        result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "adulterants",
          content: cleaned,  // No truncation - critical harm reduction content
        });
        result.sectionsExtracted.push("adulterants");
      }
    }

    return result;
  }
}

// ============================================
// DEIS (Disregard Everything I Say) PARSER
// ============================================

export class DEISParser implements SourceParser {
  sourceId = "disregardeverythingisay";

  parse(content: string, substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // === DOSAGE PARSING ===
    // DEIS has two formats:
    // 1. Route-specific sections: "Dosage (Oral)" / "Dosage (Insufflated)"
    // 2. Top-level format: *Threshold* : 20 µg at start of content (no section header)

    // First try route-specific sections (22 substances have this format)
    const dosageRoutePattern =
      /Dosage\s*\(([^)]+)\)([\s\S]*?)(?=Dosage\s*\(|Duration|Click|Physical|Cognitive|Visual|$)/gi;

    let match;
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

    // Fallback: Parse top-level dosage (for substances like LSD without Dosage(Route) header)
    // Only if no route-specific dosage was found
    if (result.dosage.length === 0) {
      // Look for dose labels at the start of content (before any ## or ** section)
      const topLevelMatch = content.match(/^[\s\S]*?(?=\*\*Physical|\*\*Cognitive|\*\*Visual|##|$)/i);
      if (topLevelMatch) {
        const ranges = this.parseDoseLabels(topLevelMatch[0]);
        if (Object.keys(ranges).length > 0) {
          result.dosage.push({
            route: "Oral", // Default to Oral for top-level format
            source: this.sourceId,
            confidence: "medium",
            ranges,
          });
        }
      }
    }

    if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");

    // === DURATION PARSING ===
    // Similar to dosage: can be in Duration(Route) section or at top level
    const durationRoutePattern =
      /Duration\s*\(([^)]+)\)([\s\S]*?)(?=Duration\s*\(|Dosage|Click|Physical|Cognitive|Visual|$)/gi;

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

    // Fallback: Parse top-level duration (before any ** section)
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

    // === EFFECTS PARSING ===
    const effectSections = ["Physical effects", "Cognitive effects", "Visual effects", "Auditory effects"];

    for (const sectionName of effectSections) {
      const sectionMatch = content.match(
        new RegExp(`\\*\\*${sectionName}:?\\*\\*([\\s\\S]*?)(?=\\*\\*(?:Physical|Cognitive|Visual|Auditory|Health|Legal)|$)`, "i")
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

    // === LEGAL STATUS PARSING ===
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
      // Also try parsing non-bold country references (common DEIS format)
      // Pattern: "- LSD is Schedule I in the United States"
      if (result.legal.length === 0) {
        for (const bullet of bullets) {
          const cleaned = cleanMarkdown(bullet);
          if (cleaned.includes("United States") || cleaned.includes("Schedule")) {
            result.legal.push({
              country: "United States",
              status: cleaned,  // No truncation - full legal details
              source: this.sourceId,
            });
            break; // Often just one entry without country headers
          }
        }
      }
      if (result.legal.length > 0) result.sectionsExtracted.push("legal");
    }

    // === HEALTH/TOLERANCE NARRATIVE ===
    // DEIS includes valuable "Health Effects, Potential Addiction, and Tolerance:" section
    const healthMatch = content.match(
      /\*\*Health\s+Effects?,?\s+(?:Potential\s+)?Addiction,?\s+and\s+Tolerance:?\*\*([\s\S]*?)(?=\*\*(?:Legal|Reader|Conclusion)|$)/i
    );
    if (healthMatch) {
      const cleaned = cleanMarkdown(healthMatch[1]).trim();
      if (cleaned.length > 50) {
        result.narrativeContent.generalNotes = result.narrativeContent.generalNotes || [];
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "health_and_tolerance",
          content: cleaned,  // No truncation
        });
        result.sectionsExtracted.push("health_tolerance");
      }
    }

    // === CONCLUSION SECTION ===
    // DEIS articles end with author's overall assessment and recommendations
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

    // === TRIP REPORTS SECTION ===
    // Links to external experience reports
    const tripReportsMatch = content.match(
      /\*\*Reader\s+submitted\s+trip\s+reports:?\*\*([\s\S]*?)(?=\*\*(?:Conclusion|Legal)|$)/i
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

    // === INTRO PARAGRAPHS ===
    // DEIS articles have intro paragraphs after dosage/timing block, before **Physical effects**
    // Two formats:
    // 1. *Heavy* : X+ µg\n\n[Intro]\n\n**Physical Effects:**
    // 2. **Duration:**\n...\n*After effects*...\n\n[Intro]\n\n**Physical Effects:**
    let introMatch = content.match(
      /\*(?:Heavy|K[- ]?Hole)\*\s*:\s*[^\n]+\n\n([\s\S]*?)(?=\*\*(?:Physical|Cognitive|Visual|Auditory)\s+[Ee]ffects)/i
    );

    // Fallback: try after *After effects* line (alternate format)
    if (!introMatch) {
      introMatch = content.match(
        /\*After effects\s*:?\*\s*[^\n]+\n\n([\s\S]*?)(?=\*\*(?:Physical|Cognitive|Visual|Auditory)\s+[Ee]ffects)/i
      );
    }

    if (introMatch) {
      // Clean up any remaining images or links at the start
      let introCleaned = cleanMarkdown(introMatch[1]).trim();
      // Remove any image placeholders that cleanMarkdown might leave
      introCleaned = introCleaned.replace(/^[\s\n]*image[\s\n]*/gi, '').trim();

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

  // Parse *Label* : value patterns for dosage
  private parseDoseLabels(content: string): ParsedDosageRoute["ranges"] {
    const ranges: ParsedDosageRoute["ranges"] = {};

    const labelPatterns = [
      { pattern: /\*Threshold\*\s*:\s*([^\n*]+)/i, field: "threshold" },
      { pattern: /\*Light\*\s*:\s*([^\n*]+)/i, field: "light" },
      { pattern: /\*Common\*\s*:\s*([^\n*]+)/i, field: "common" },
      { pattern: /\*Strong\*\s*:\s*([^\n*]+)/i, field: "strong" },
      { pattern: /\*(?:Heavy|K[- ]?Hole)\*\s*:\s*([^\n*]+)/i, field: "heavy" },
    ];

    for (const { pattern, field } of labelPatterns) {
      const labelMatch = content.match(pattern);
      if (labelMatch) {
        const parsed = parseDoseRange(labelMatch[1]);
        if (parsed) {
          (ranges as Record<string, unknown>)[field] = parsed;
        }
      }
    }

    return ranges;
  }

  // Parse *Label* : value patterns for duration
  private parseDurationLabels(content: string): ParsedDurationRoute["stages"] {
    const stages: ParsedDurationRoute["stages"] = {};

    const stagePatterns = [
      { pattern: /\*Onset\*\s*:\s*([^\n*]+)/i, field: "onset" },
      { pattern: /\*Peak\*\s*:\s*([^\n*]+)/i, field: "peak" },
      { pattern: /\*(?:Total\s+)?Duration\*\s*:\s*([^\n*]+)/i, field: "total" },
      { pattern: /\*Come\s*down\*\s*:\s*([^\n*]+)/i, field: "offset" },
      { pattern: /\*(?:After\s*Effects?|Normal After Effects)\*\s*:\s*([^\n*]+)/i, field: "afterEffects" },
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

  // Extract effect name from bullet, handling hyphenated names correctly
  private extractEffectName(bullet: string): string {
    // First try to extract from markdown link: [Effect name](url)
    const linkMatch = bullet.match(/\[([^\]]+)\]/);
    if (linkMatch) {
      return cleanMarkdown(linkMatch[1]);
    }

    // Then try to extract bold text: **Effect name** - description
    // Use greedy match for bold to handle hyphenated names like **Deja-Vu**
    const boldMatch = bullet.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      return cleanMarkdown(boldMatch[1]);
    }

    // Handle incomplete bold (e.g., "**Outrospection" where closing ** is on next line)
    const incompleteBoldMatch = bullet.match(/^\*\*([^*]+)$/);
    if (incompleteBoldMatch) {
      return cleanMarkdown(incompleteBoldMatch[1]);
    }

    // Fallback: take first part before " - " (description separator)
    // Note: Using " - " with spaces to avoid splitting on hyphens within names
    const descSeparator = bullet.indexOf(" - ");
    if (descSeparator > 0) {
      return cleanMarkdown(bullet.slice(0, descSeparator));
    }

    // Final fallback: clean the whole bullet
    return cleanMarkdown(bullet.slice(0, 100));
  }
}

// ============================================
// DRUG USERS BIBLE PARSER
// ============================================

export class DrugUsersBibleParser implements SourceParser {
  sourceId = "drugusersbible";

  parse(content: string, substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // Parse Quick Reference section
    const quickRefSection = extractSection(content, "Quick Reference", 2);
    if (quickRefSection) {
      const bullets = extractLabeledBullets(quickRefSection);

      // Fix 1: First extract RoA to use for route assignment
      // Format: "- **RoA:** Vaporised" or "- **RoA:** Oral" or "- **RoA:** Injection"
      let extractedRoute = "Oral"; // Default fallback
      for (const bullet of bullets) {
        const label = bullet.label.toLowerCase();
        if (label === "roa" || label.includes("route")) {
          const roaValue = bullet.value.trim().toLowerCase();
          // Map DUB RoA values to normalized route names
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
          // If unrecognized, keep as Oral (safest default)
          break;
        }
      }

      for (const bullet of bullets) {
        const label = bullet.label.toLowerCase();

        // Parse duration from "Anticipated: Onset / Duration"
        // Format: "1 Hour / 10 Hours" or "20 Seconds / 6 Minutes"
        if (label.includes("onset") || label.includes("duration")) {
          // Fix 2: Add Seconds to regex pattern (was missing, causing DMT to parse incorrectly)
          const durationMatch = bullet.value.match(/(\d+)\s*(?:Seconds?|Minutes?|Hours?)/gi);
          if (durationMatch) {
            const stages: ParsedDurationRoute["stages"] = {};
            // First match is onset, second is total duration
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

        // Parse max dose
        if (label.includes("max") && label.includes("dose")) {
          const parsed = parseDoseRange(bullet.value);
          if (parsed) {
            result.dosage.push({
              route: extractedRoute,
              source: this.sourceId,
              confidence: "low",
              ranges: { strong: parsed },
              notes: "Maximum dose experienced by author",
            });
          }
        }
      }

      if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");
      if (result.duration.length > 0) result.sectionsExtracted.push("duration");
    }

    // Parse Subjective Experience as narrative (most valuable content) - no truncation
    const experienceSection = extractSection(content, "Subjective Experience", 2);
    if (experienceSection) {
      result.narrativeContent.experienceReports.push({
        source: this.sourceId,
        content: cleanMarkdown(experienceSection),  // No truncation - full trip reports
      });
      result.sectionsExtracted.push("experience");
    }

    return result;
  }
}

// ============================================
// DRUG CLASSROOM PARSER
// ============================================

export class DrugClassroomParser implements SourceParser {
  sourceId = "thedrugclassroom";

  parse(content: string, substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // Drug Classroom has more academic format
    // Parse Dose section
    const doseSection = extractSection(content, "Dose", 2);
    if (doseSection) {
      // Look for route subsections (#### Oral, #### Insufflated)
      const routePattern = /####\s*([^\n]+)([\s\S]*?)(?=####|##|$)/gi;
      let match;

      while ((match = routePattern.exec(doseSection)) !== null) {
        const routeName = match[1].trim();
        const routeContent = match[2];

        const ranges: ParsedDosageRoute["ranges"] = {};
        const labelPatterns = [
          { pattern: /Light[:\s]+([^\n]+)/i, field: "light" },
          { pattern: /Common[:\s]+([^\n]+)/i, field: "common" },
          { pattern: /Strong[:\s]+([^\n]+)/i, field: "strong" },
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

        if (Object.keys(ranges).length > 0) {
          result.dosage.push({
            route: normalizeRoute(routeName),
            source: this.sourceId,
            confidence: "medium",
            ranges,
          });
        }
      }

      if (result.dosage.length > 0) result.sectionsExtracted.push("dosage");
    }

    // Parse Timeline section
    const timelineSection = extractSection(content, "Timeline", 2);
    if (timelineSection) {
      const routePattern = /####\s*([^\n]+)([\s\S]*?)(?=####|##|$)/gi;
      let match;

      while ((match = routePattern.exec(timelineSection)) !== null) {
        const routeName = match[1].trim();
        const routeContent = match[2];

        const stages: ParsedDurationRoute["stages"] = {};
        const stagePatterns = [
          { pattern: /Total[:\s]+([^\n]+)/i, field: "total" },
          { pattern: /Onset[:\s]+([^\n]+)/i, field: "onset" },
          { pattern: /Strongest[:\s]+([^\n]+)/i, field: "peak" },
        ];

        for (const { pattern, field } of stagePatterns) {
          const stageMatch = routeContent.match(pattern);
          if (stageMatch) {
            const parsed = parseDurationRange(stageMatch[1]);
            if (parsed) {
              (stages as Record<string, unknown>)[field] = parsed;
            }
          }
        }

        if (Object.keys(stages).length > 0) {
          result.duration.push({
            route: normalizeRoute(routeName),
            source: this.sourceId,
            confidence: "medium",
            stages,
          });
        }
      }

      if (result.duration.length > 0) result.sectionsExtracted.push("duration");
    }

    // Parse Effects section
    const effectsSection = extractSection(content, "Effects", 2);
    if (effectsSection) {
      const categories = ["Positive", "Negative", "Recreational", "Medical", "Sexual"];

      for (const category of categories) {
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

    // Parse Chemistry data
    // Drug Classroom format: "PubChem: 12345\nMolecular formula: C11H15NO2\nMolecular weight: 193.246 g/mol\nIUPAC: ..."
    const chemistry: Partial<ParsedChemistry> = { sources: [this.sourceId] };

    const formulaMatch = content.match(/Molecular formula:\s*([A-Za-z0-9]+)/i);
    if (formulaMatch) {
      chemistry.formula = formulaMatch[1].trim();
    }

    const weightMatch = content.match(/Molecular weight:\s*([^\n]+)/i);
    if (weightMatch) {
      chemistry.molecularWeight = weightMatch[1].trim();
    }

    const iupacMatch = content.match(/IUPAC:\s*([^\n]+)/i);
    if (iupacMatch) {
      const iupac = iupacMatch[1].trim();
      // Filter out very short placeholder values
      if (iupac.length >= 10) {
        chemistry.iupac = iupac;
      }
    }

    if (Object.keys(chemistry).length > 1) {
      result.chemistry = chemistry;
      result.sectionsExtracted.push("chemistry");
    }

    // Parse narrative overview - no truncation
    // Drug Classroom format: "# Name\n*Source: url*\n\nOverview paragraph..."
    // Extract content between the source line and the first ---
    const overviewMatch = content.match(/\*Source:[^\n]+\*\n\n([\s\S]*?)(?=\n---|\n##)/);
    if (overviewMatch) {
      const overview = stripReferences(cleanMarkdown(overviewMatch[1])).trim();
      if (overview.length >= 50) {
        result.narrativeContent.generalNotes = [
          {
            source: this.sourceId,
            section: "overview",
            content: overview,  // No truncation - full overview
          },
        ];
        result.sectionsExtracted.push("overview");
      }
    }

    // Parse Safety section as narrative
    const safetySection = extractSection(content, "Safety", 2);
    if (safetySection) {
      const safetyContent = stripReferences(cleanMarkdown(safetySection)).trim();
      if (safetyContent.length >= 50) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "safety",
          content: safetyContent,
        });
        result.sectionsExtracted.push("safety");
      }
    }

    // Parse History section as narrative
    const historySection = extractSection(content, "History", 2);
    if (historySection) {
      const historyContent = stripReferences(cleanMarkdown(historySection)).trim();
      if (historyContent.length >= 50) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "history",
          content: historyContent,
        });
        result.sectionsExtracted.push("history");
      }
    }

    // Parse Pharmacology section as narrative
    const pharmacologySection = extractSection(content, "Pharmacology", 2);
    if (pharmacologySection) {
      const pharmacologyContent = stripReferences(cleanMarkdown(pharmacologySection)).trim();
      if (pharmacologyContent.length >= 50) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "pharmacology",
          content: pharmacologyContent,
        });
        result.sectionsExtracted.push("pharmacology");
      }
    }

    // Parse Chemistry section as narrative (for prose descriptions, not just metadata)
    const chemistrySection = extractSection(content, "Chemistry", 2);
    if (chemistrySection) {
      const chemistryContent = stripReferences(cleanMarkdown(chemistrySection)).trim();
      if (chemistryContent.length >= 50) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "chemistry",
          content: chemistryContent,
        });
      }
    }

    return result;
  }
}

// ============================================
// WIKIPEDIA PARSER
// ============================================

export class WikipediaParser implements SourceParser {
  sourceId = "wikipedia";

  parse(content: string, substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // Parse Pharmacology section
    const pharmacoSection = extractSection(content, "Pharmacology", 2);
    if (pharmacoSection) {
      const pharmacology: Partial<ParsedPharmacology> = { sources: [this.sourceId] };

      // Look for half-life mentions - capture full sentence(s), not just to first period
      const halfLifeMatch = pharmacoSection.match(/half[- ]?life[^.]*(?:\.[^.]*){0,2}/i);
      if (halfLifeMatch) {
        pharmacology.halfLife = cleanMarkdown(halfLifeMatch[0]);
      }

      // Look for bioavailability - capture full context
      const bioMatch = pharmacoSection.match(/bioavailability[^.]*(?:\.[^.]*){0,1}/i);
      if (bioMatch) {
        pharmacology.bioavailability = cleanMarkdown(bioMatch[0]);
      }

      // Look for mechanism of action
      const mechanismSection = extractSection(pharmacoSection, "Pharmacodynamics", 3);
      if (mechanismSection) {
        // Pre-strip markdown links to avoid URL periods causing truncation
        const sectionWithoutLinks = stripMarkdownLinks(mechanismSection);
        const mechanisms: string[] = [];
        const mechanismPatterns = [
          /acts?\s+as\s+(?:an?\s+)?([^.]+(?:agonist|antagonist|inhibitor))/gi,
          /([^.]+(?:agonist|antagonist|inhibitor))\s+(?:at|of)\s+(?:the\s+)?([^.]+)/gi,
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
      }

      if (Object.keys(pharmacology).length > 1) {
        result.pharmacology = pharmacology;
        result.sectionsExtracted.push("pharmacology");
      }

      // Also capture full Pharmacology section as narrative (no truncation)
      const pharmacoNarrative = stripReferences(cleanMarkdown(pharmacoSection));
      if (pharmacoNarrative.length >= 100) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "pharmacology",
          content: pharmacoNarrative,
        });
      }
    }

    // Parse Legal status section
    const legalSection = extractSection(content, "Legal status", 2);
    if (legalSection) {
      // Wikipedia often has subsections by country
      const countryPattern = /####?\s*([^\n]+)([\s\S]*?)(?=####?|###|##|$)/gi;
      let match;

      while ((match = countryPattern.exec(legalSection)) !== null) {
        const country = match[1].trim();
        const statusContent = cleanMarkdown(match[2]);  // No truncation - full legal details

        if (country && statusContent && !country.toLowerCase().includes("see also")) {
          result.legal.push({
            country: normalizeCountry(country),
            status: statusContent,
            source: this.sourceId,
          });
        }
      }

      if (result.legal.length > 0) result.sectionsExtracted.push("legal");
    }

    // Parse Adverse effects section
    // Fix: Wikipedia uses prose format, not bullet lists - capture as narrative
    // Also try multiple header levels (level 2, then level 3, then level 4)
    let adverseSection = extractSection(content, "Adverse effects", 2);
    if (!adverseSection) {
      adverseSection = extractSection(content, "Adverse effects", 3);
    }
    if (!adverseSection) {
      adverseSection = extractSection(content, "Adverse effects", 4);
    }
    // Also try "Side effects" as alternative header
    if (!adverseSection) {
      adverseSection = extractSection(content, "Side effects", 2);
    }
    if (adverseSection) {
      // First try bullet extraction for structured data
      const bullets = extractBulletList(adverseSection);
      for (const bullet of bullets) {
        const cleaned = cleanMarkdown(bullet);
        // Filter out very long items (likely prose fragments)
        if (cleaned.length > 3 && cleaned.length < 100) {
          result.effects.push({
            name: cleaned,
            category: "negative",
            source: this.sourceId,
          });
        }
      }

      // If no bullets found, capture prose as narrative (Wikipedia format) - no truncation
      if (result.effects.length === 0) {
        const cleaned = stripReferences(cleanMarkdown(adverseSection));
        if (cleaned.length >= 50) {
          result.narrativeContent.generalNotes.push({
            source: this.sourceId,
            section: "adverse_effects",
            content: cleaned,
          });
          result.sectionsExtracted.push("adverse_effects");
        }
      } else {
        result.sectionsExtracted.push("effects");
      }
    }

    // Parse Contraindications - try multiple header levels
    let contraSection = extractSection(content, "Contraindications", 2);
    if (!contraSection) {
      contraSection = extractSection(content, "Contraindications", 3);
    }
    if (contraSection) {
      const bullets = extractBulletList(contraSection);
      if (bullets.length > 0) {
        result.harmReduction = {
          rules: [],
          contraindications: bullets.map(cleanMarkdown),
          sources: [this.sourceId],
        };
        result.sectionsExtracted.push("contraindications");
      } else {
        // Capture prose as narrative if no bullets - no truncation
        const cleaned = stripReferences(cleanMarkdown(contraSection));
        if (cleaned.length >= 30) {
          result.narrativeContent.generalNotes.push({
            source: this.sourceId,
            section: "contraindications",
            content: cleaned,
          });
          result.sectionsExtracted.push("contraindications");
        }
      }
    }

    // Parse Chemistry section (Fix: was not being extracted)
    const chemistrySection = extractSection(content, "Chemistry", 2);
    if (chemistrySection) {
      const chemistry: Partial<ParsedChemistry> = { sources: [this.sourceId] };

      // Extract SMILES - patterns: "**SMILES:** CCO" or "SMILES: CCO"
      const smilesMatch = chemistrySection.match(/\*?\*?SMILES:?\*?\*?\s*([A-Za-z0-9@+\-\[\]\\\/()=#]+)/i);
      if (smilesMatch) {
        const smiles = smilesMatch[1].trim();
        if (smiles.length >= 3) {
          chemistry.smiles = smiles;
        }
      }

      // Extract molecular formula - "molecular formula of C2H6O" or "Molecular formula: C2H6O"
      const formulaMatch = chemistrySection.match(/molecular formula[:\s]+(?:of\s+)?([A-Za-z0-9−]+)/i);
      if (formulaMatch) {
        chemistry.formula = formulaMatch[1].replace(/−/g, "").trim();
      }

      // Extract molecular weight - "molecular weight of 46.07 g/mol"
      const weightMatch = chemistrySection.match(/molecular weight[:\s]+(?:of\s+)?([^.]+g\/mol)/i);
      if (weightMatch) {
        chemistry.molecularWeight = weightMatch[1].trim();
      }

      // Extract InChI
      const inchiMatch = chemistrySection.match(/InChI[=:\s]+([^\n]+)/i);
      if (inchiMatch) {
        chemistry.inchi = inchiMatch[1].trim();
      }

      if (Object.keys(chemistry).length > 1) {
        result.chemistry = chemistry;
        result.sectionsExtracted.push("chemistry");
      }

      // Also capture Chemistry section as narrative (no truncation)
      const chemNarrative = stripReferences(cleanMarkdown(chemistrySection));
      if (chemNarrative.length >= 100) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "chemistry",
          content: chemNarrative,
        });
      }
    }

    // Parse Interactions section (Fix: was not being extracted)
    const interactionsSection = extractSection(content, "Interactions", 2);
    if (interactionsSection) {
      // Try to extract bullet list items as interaction substances
      const bullets = extractBulletList(interactionsSection);
      for (const bullet of bullets) {
        const cleaned = cleanMarkdown(bullet);
        // Extract substance name (often formatted as "**Substance** - description")
        const substanceMatch = cleaned.match(/^\*?\*?([^*\-–:]+)/);
        if (substanceMatch) {
          const substance = substanceMatch[1].trim();
          if (substance.length >= 2 && substance.length < 50) {
            result.interactions.push({
              substance: substance,
              severity: detectInteractionSeverity(cleaned),
              description: cleaned,  // No truncation - full interaction details
              source: this.sourceId,
            });
          }
        }
      }

      // If no bullets, capture as narrative - no truncation
      if (result.interactions.length === 0) {
        const cleaned = stripReferences(cleanMarkdown(interactionsSection));
        if (cleaned.length >= 50) {
          result.narrativeContent.generalNotes.push({
            source: this.sourceId,
            section: "interactions",
            content: cleaned,
          });
        }
      } else {
        result.sectionsExtracted.push("interactions");
      }
    }

    // Extract lead paragraph as narrative - no truncation
    const leadMatch = content.match(/^#\s*[^\n]+\n\*[^\n]+\*\n\n([\s\S]*?)(?=\n##)/);
    if (leadMatch) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "overview",
        content: stripReferences(cleanMarkdown(leadMatch[1])),
      });
    }

    // === Additional narrative sections (no truncation) ===

    // Uses section (medical, recreational, performance enhancement)
    const usesSection = extractSection(content, "Uses", 2);
    if (usesSection) {
      const usesNarrative = stripReferences(cleanMarkdown(usesSection));
      if (usesNarrative.length >= 100) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "uses",
          content: usesNarrative,
        });
        result.sectionsExtracted.push("uses");
      }
    }

    // Overdose section (harm reduction, toxicity)
    const overdoseSection = extractSection(content, "Overdose", 2);
    if (overdoseSection) {
      const overdoseNarrative = stripReferences(cleanMarkdown(overdoseSection));
      if (overdoseNarrative.length >= 100) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "overdose",
          content: overdoseNarrative,
        });
        result.sectionsExtracted.push("overdose");
      }
    }

    // Dependence and withdrawal section
    const dependenceSection = extractSection(content, "Dependence and withdrawal", 2) ||
                              extractSection(content, "Dependence", 2) ||
                              extractSection(content, "Withdrawal", 2);
    if (dependenceSection) {
      const dependenceNarrative = stripReferences(cleanMarkdown(dependenceSection));
      if (dependenceNarrative.length >= 100) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "dependence",
          content: dependenceNarrative,
        });
        result.sectionsExtracted.push("dependence");
      }
    }

    // History section
    const historySection = extractSection(content, "History", 2);
    if (historySection) {
      const historyNarrative = stripReferences(cleanMarkdown(historySection));
      if (historyNarrative.length >= 100) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "history",
          content: historyNarrative,
        });
        result.sectionsExtracted.push("history");
      }
    }

    // Effects section (general effects beyond adverse)
    const effectsSection = extractSection(content, "Effects", 2);
    if (effectsSection) {
      const effectsNarrative = stripReferences(cleanMarkdown(effectsSection));
      if (effectsNarrative.length >= 100) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "effects",
          content: effectsNarrative,
        });
      }
    }

    return result;
  }
}

// Export all parsers
export const isomerDesignParser = new IsomerDesignParser();
export const saferPartyParser = new SaferPartyParser();
export const deiaParser = new DEISParser();
export const drugUsersBibleParser = new DrugUsersBibleParser();
export const drugClassroomParser = new DrugClassroomParser();
export const wikipediaParser = new WikipediaParser();
