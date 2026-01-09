/**
 * DrugBank Parser
 * Highly structured source for chemistry, pharmacology, interactions
 *
 * Format:
 * - ## Overview with ### Description, Background, Indication, Pharmacodynamics
 * - ### Mechanism of Action with receptor/action pairs
 * - ### Absorption, Metabolism, Half-life, Toxicity
 * - ### Drug Interactions with detailed interaction list
 * - ## Chemical Information with **SMILES**, **IUPAC Name**, **Formula**, etc.
 * - ## Additional Information with ### Patents, ### Modality
 */

import type {
  SourceParser,
  ParserResult,
  ParsedChemistry,
  ParsedPharmacology,
  ParsedInteraction,
} from "./types";

import {
  createEmptyParserResult,
  extractSection,
  cleanMarkdown,
  stripReferences,
} from "./base";

// === Chemical Information Parsing ===

function parseChemicalInformation(content: string, sourceId: string): Partial<ParsedChemistry> {
  let section = extractSection(content, "Chemical Information", 2);
  if (!section) return { sources: [sourceId] };

  // Fix 1: Join multiline chemical formulas
  // DrugBank format spans multiple lines:
  //   **Chemical Formula:** C
  //   13
  //   H
  //   18
  //   O
  //   2
  // Apply repeatedly to join all element-count pairs
  let prev = "";
  while (prev !== section) {
    prev = section;
    section = section.replace(/([A-Z])\n(\d+)/g, "$1$2");
    section = section.replace(/([a-z])\n(\d+)/g, "$1$2");
  }

  const chemistry: Partial<ParsedChemistry> = { sources: [sourceId] };

  // Extract Chemical Formula with multiline handling
  // After preprocessing, formula may still span lines: "C13\nH18\nO2"
  const formulaMatch = section.match(/\*\*Chemical Formula:\*\*\s*([A-Za-z0-9\n]+?)(?=\n\n|\n\*\*|$)/);
  if (formulaMatch) {
    // Join all lines and remove any whitespace
    const formula = formulaMatch[1].replace(/\n/g, "").replace(/\s+/g, "");
    if (formula.length >= 2) {
      chemistry.formula = formula;
    }
  }

  // Parse other **Label:** Value patterns
  // Note: Removed DrugBank ID → cas mapping (was incorrect), removed formula (handled above)
  const patterns: Array<{ pattern: RegExp; field: keyof ParsedChemistry }> = [
    { pattern: /\*\*SMILES:\*\*\s*([^\n]+)/i, field: "smiles" },
    { pattern: /\*\*Weight:\*\*\s*([^\n]+)/i, field: "molecularWeight" },
  ];

  for (const { pattern, field } of patterns) {
    const match = section.match(pattern);
    if (match) {
      let value = match[1].trim();
      // Clean up any remaining whitespace
      value = value.replace(/\s+/g, "");
      if (field !== "sources") {
        (chemistry as Record<string, unknown>)[field] = value;
      }
    }
  }

  // Fix 3: Extract IUPAC with better pattern (handles multiline and stops at next field)
  const iupacMatch = section.match(/\*\*IUPAC Name:\*\*\s*(.+?)(?=\n\*\*|\n\n|$)/is);
  if (iupacMatch) {
    const iupac = iupacMatch[1].replace(/\n/g, " ").trim();
    // Validate: skip if too short or looks like mechanism description
    if (iupac.length >= 5 && !iupac.includes("blocker") && !iupac.includes("agonist")) {
      chemistry.iupac = iupac;
    }
  }

  // Fix 4: Extract CAS from ### CAS number subsection (in Additional Information)
  const casSection = extractSection(content, "CAS number", 3);
  if (casSection) {
    const casValue = casSection.split("\n")[0].trim();
    // Validate CAS format: digits-digits-digit (e.g., 15687-27-1)
    if (/^\d{2,7}-\d{2}-\d$/.test(casValue)) {
      chemistry.cas = casValue;
    }
  }

  // Extract InChI if present (with improved pattern for multiline)
  const inchiMatch = section.match(/\*\*InChI:\*\*\s*(.+?)(?=\n\*\*|\n\n|$)/is);
  if (inchiMatch) {
    chemistry.inchi = inchiMatch[1].replace(/\n/g, "").trim();
  }

  // Extract InChI Key (in Additional Information section)
  const inchiKeySection = extractSection(content, "InChI Key", 3);
  if (inchiKeySection) {
    const inchiKeyValue = inchiKeySection.split("\n")[0].trim();
    if (inchiKeyValue.length > 10) {
      chemistry.inchiKey = inchiKeyValue;
    }
  }

  return chemistry;
}

// === Pharmacology Parsing ===

function parsePharmacologySection(
  content: string,
  sourceId: string
): Partial<ParsedPharmacology> {
  const pharmacology: Partial<ParsedPharmacology> = { sources: [sourceId] };

  // Parse Half-life (Fix 6: Enhanced reference stripping)
  const halfLifeSection = extractSection(content, "Half-life", 3);
  if (halfLifeSection) {
    let cleaned = cleanMarkdown(halfLifeSection);
    // Remove inline citation numbers (standalone numbers on their own lines like "\n10\n")
    cleaned = cleaned.replace(/\n\d{1,3}\n/g, " ");
    // Remove trailing reference numbers
    cleaned = cleaned.replace(/\s*\d{1,3}\s*$/, "").trim();
    // Clean up multiple spaces
    cleaned = cleaned.replace(/\s+/g, " ");
    if (cleaned) pharmacology.halfLife = cleaned;
  }

  // Parse Absorption for bioavailability
  const absorptionSection = extractSection(content, "Absorption", 3);
  if (absorptionSection) {
    const bioMatch = absorptionSection.match(/bioavailability[:\s]+(?:is\s+)?(?:around\s+)?(\d+[%\d\-–\s]*%?)/i);
    if (bioMatch) pharmacology.bioavailability = bioMatch[1].trim();
  }

  // Parse Metabolism (no truncation - full metabolism pathway info)
  const metabolismSection = extractSection(content, "Metabolism", 3);
  if (metabolismSection) {
    pharmacology.metabolism = stripReferences(cleanMarkdown(metabolismSection));
  }

  // Parse Mechanism of Action
  const mechanismSection = extractSection(content, "Mechanism of Action", 3);
  if (mechanismSection) {
    // DrugBank lists receptor-action pairs
    const receptors: Array<{ name: string; action: string }> = [];
    const lines = mechanismSection.split("\n");

    let currentReceptor = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check if it's an action (Agonist, Antagonist, Inhibitor, etc.)
      if (/^(Agonist|Antagonist|Inhibitor|Potentiator|Modulator|Negative modulator|Positive modulator)/i.test(trimmed)) {
        if (currentReceptor) {
          receptors.push({
            name: currentReceptor,
            action: trimmed.toLowerCase(),
          });
        }
        currentReceptor = "";
      } else if (trimmed.length > 2 && !trimmed.startsWith("+") && !trimmed.includes("more targets")) {
        // This is a receptor name
        currentReceptor = cleanMarkdown(trimmed);
      }
    }

    if (receptors.length > 0) {
      pharmacology.receptors = receptors;
    }

    // Also extract as mechanism of action text
    const mechanisms: string[] = [];
    for (const receptor of receptors) {
      mechanisms.push(`${receptor.name}: ${receptor.action}`);
    }
    if (mechanisms.length > 0) {
      pharmacology.mechanismOfAction = mechanisms;
    }
  }

  // Parse Pharmacodynamics narrative
  const pdSection = extractSection(content, "Pharmacodynamics", 3);
  if (pdSection) {
    const cleaned = stripReferences(cleanMarkdown(pdSection));
    if (!pharmacology.mechanismOfAction) {
      // Extract mechanism hints from narrative
      const mechanisms: string[] = [];
      const mechanismPatterns = [
        /acts?\s+as\s+(?:an?\s+)?([^.]+(?:agonist|antagonist|inhibitor))/gi,
        /(?:agonist|antagonist|inhibitor)\s+(?:at|of|for)\s+([^.]+receptors?)/gi,
      ];

      for (const pattern of mechanismPatterns) {
        let match;
        while ((match = pattern.exec(cleaned)) !== null) {
          mechanisms.push(cleanMarkdown(match[1]));
        }
      }

      if (mechanisms.length > 0) {
        pharmacology.mechanismOfAction = mechanisms;
      }
    }
  }

  return pharmacology;
}

// === Drug Interactions Parsing ===

function parseDrugInteractions(content: string, sourceId: string): ParsedInteraction[] {
  const section = extractSection(content, "Drug Interactions", 3);
  if (!section) return [];

  const interactions: ParsedInteraction[] = [];
  const lines = section.split("\n");

  let currentSubstance = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip header text
    if (
      trimmed.includes("should not be interpreted") ||
      trimmed.includes("healthcare provider") ||
      trimmed.includes("experiencing an interaction") ||
      trimmed.includes("does not necessarily mean")
    ) {
      continue;
    }

    // Check if this is an interaction description (contains specific patterns)
    // Fix 5: Expanded description patterns to capture more interactions
    const lower = trimmed.toLowerCase();
    if (
      lower.includes("can be increased") ||
      lower.includes("can be decreased") ||
      lower.includes("may decrease") ||
      lower.includes("may increase") ||
      lower.includes("risk or severity") ||
      lower.includes("therapeutic efficacy") ||
      lower.includes("serum concentration") ||
      lower.includes("serum level") ||
      lower.includes("excretion rate") ||
      lower.includes("metabolism of") ||
      lower.includes("activities of") ||
      lower.includes("adverse effects") ||
      lower.includes("toxic effects") ||
      lower.includes("clearance of") ||
      lower.includes("absorption of") ||
      lower.includes("hypotensive effect") ||
      lower.includes("hypertensive effect") ||
      lower.includes("cns depression") ||
      lower.includes("serotonergic") ||
      lower.includes("qt prolongation") ||
      lower.includes("hepatotoxic") ||
      lower.includes("nephrotoxic") ||
      lower.includes("sedative")
    ) {
      if (currentSubstance) {
        // Determine severity based on description keywords
        let severity: ParsedInteraction["severity"] = "caution";

        // Dangerous: life-threatening or severe interactions
        if (
          lower.includes("serotonin syndrome") ||
          lower.includes("qt prolongation") ||
          lower.includes("torsades") ||
          lower.includes("fatal") ||
          lower.includes("death")
        ) {
          severity = "dangerous";
        }
        // Unsafe: significant risk
        else if (
          lower.includes("contraindicated") ||
          lower.includes("avoid") ||
          lower.includes("severe") ||
          lower.includes("significant")
        ) {
          severity = "unsafe";
        }
        // Default to caution for all other interactions

        interactions.push({
          substance: currentSubstance,
          severity,
          description: cleanMarkdown(trimmed),
          source: sourceId,
        });
      }
      currentSubstance = "";
    } else if (trimmed.length > 1 && !trimmed.startsWith("+")) {
      // This is a substance name
      currentSubstance = cleanMarkdown(trimmed);
    }
  }

  // Limit to most relevant interactions (DrugBank can have thousands)
  return interactions.slice(0, 50);
}

// === Food Interactions Parsing ===

function parseFoodInteractions(content: string, sourceId: string): string[] {
  const section = extractSection(content, "Food Interactions", 3);
  if (!section) return [];

  const items: string[] = [];
  const lines = section.split("\n");

  for (const line of lines) {
    const rawTrimmed = line.trim();
    // Fix 2: Stop BEFORE cleanMarkdown if we hit section headers or chemical info
    // (cleanMarkdown strips header markers, so check raw line first)
    if (
      rawTrimmed.startsWith("## ") ||
      rawTrimmed.startsWith("**DrugBank ID") ||
      rawTrimmed.startsWith("**SMILES") ||
      rawTrimmed.startsWith("**Chemical") ||
      rawTrimmed.startsWith("**Synonyms") ||
      rawTrimmed === "Chemical Information"
    ) {
      break;
    }
    // Now clean the line
    const cleaned = cleanMarkdown(rawTrimmed);
    // Skip empty lines, header markers, and bold labels
    if (
      cleaned.length > 2 &&
      !rawTrimmed.startsWith("#") &&
      !rawTrimmed.startsWith("**")
    ) {
      items.push(cleaned);
    }
  }

  return items;
}

// === Description/Background Parsing ===

function parseOverviewNarrative(
  content: string,
  sourceId: string
): Array<{ section: string; content: string }> {
  const notes: Array<{ section: string; content: string }> = [];

  // Parse Description (no truncation)
  const descSection = extractSection(content, "Description", 3);
  if (descSection) {
    const cleaned = stripReferences(cleanMarkdown(descSection));
    if (cleaned.length > 20) {
      notes.push({ section: "description", content: cleaned });
    }
  }

  // Parse Background (no truncation)
  const bgSection = extractSection(content, "Background", 3);
  if (bgSection) {
    const cleaned = stripReferences(cleanMarkdown(bgSection));
    if (cleaned.length > 20) {
      notes.push({ section: "background", content: cleaned });
    }
  }

  // Parse Indication (no truncation)
  const indSection = extractSection(content, "Indication", 3);
  if (indSection) {
    const cleaned = stripReferences(cleanMarkdown(indSection));
    if (cleaned.length > 20) {
      notes.push({ section: "indication", content: cleaned });
    }
  }

  // Parse Toxicity (no truncation - critical safety info)
  const toxSection = extractSection(content, "Toxicity", 3);
  if (toxSection) {
    const cleaned = stripReferences(cleanMarkdown(toxSection));
    if (cleaned.length > 20) {
      notes.push({ section: "toxicity", content: cleaned });
    }
  }

  // === Additional harm reduction sections ===

  // Parse Short-term Risks (critical safety info)
  const shortTermSection = extractSection(content, "Short-term Risks", 3);
  if (shortTermSection) {
    const cleaned = stripReferences(cleanMarkdown(shortTermSection));
    if (cleaned.length > 20) {
      notes.push({ section: "short_term_risks", content: cleaned });
    }
  }

  // Parse Long-term Risks (critical safety info)
  const longTermSection = extractSection(content, "Long-term Risks", 3);
  if (longTermSection) {
    const cleaned = stripReferences(cleanMarkdown(longTermSection));
    if (cleaned.length > 20) {
      notes.push({ section: "long_term_risks", content: cleaned });
    }
  }

  // Parse Effects on human performance
  const performanceSection = extractSection(content, "Effects on human performance", 3);
  if (performanceSection) {
    const cleaned = stripReferences(cleanMarkdown(performanceSection));
    if (cleaned.length > 20) {
      notes.push({ section: "effects_on_performance", content: cleaned });
    }
  }

  // Parse Non-medical use (abuse patterns)
  const nonMedicalSection = extractSection(content, "Non-medical use", 3);
  if (nonMedicalSection) {
    const cleaned = stripReferences(cleanMarkdown(nonMedicalSection));
    if (cleaned.length > 20) {
      notes.push({ section: "non_medical_use", content: cleaned });
    }
  }

  // Parse Safer Use guidelines
  const saferUseSection = extractSection(content, "Safer Use", 2);
  if (saferUseSection) {
    const cleaned = stripReferences(cleanMarkdown(saferUseSection));
    if (cleaned.length > 20) {
      notes.push({ section: "safer_use", content: cleaned });
    }
  }

  // Parse Dependence and withdrawal
  const dependenceSection = extractSection(content, "Dependence and withdrawal", 3) ||
                            extractSection(content, "Dependence", 3);
  if (dependenceSection) {
    const cleaned = stripReferences(cleanMarkdown(dependenceSection));
    if (cleaned.length > 20) {
      notes.push({ section: "dependence", content: cleaned });
    }
  }

  // Parse Addiction section
  const addictionSection = extractSection(content, "Addiction", 3);
  if (addictionSection) {
    const cleaned = stripReferences(cleanMarkdown(addictionSection));
    if (cleaned.length > 20) {
      notes.push({ section: "addiction", content: cleaned });
    }
  }

  // Parse Pharmacodynamics narrative (full section)
  const pharmacodynamicsSection = extractSection(content, "Pharmacodynamics", 3);
  if (pharmacodynamicsSection) {
    const cleaned = stripReferences(cleanMarkdown(pharmacodynamicsSection));
    if (cleaned.length > 50) {
      notes.push({ section: "pharmacodynamics", content: cleaned });
    }
  }

  return notes;
}

// === Main Parser ===

export class DrugBankParser implements SourceParser {
  sourceId = "drugbank";

  parse(content: string, substanceName: string): ParserResult {
    const result = createEmptyParserResult();

    // Parse chemical information
    result.chemistry = parseChemicalInformation(content, this.sourceId);

    // Parse pharmacology
    result.pharmacology = parsePharmacologySection(content, this.sourceId);

    // Parse drug interactions
    result.interactions = parseDrugInteractions(content, this.sourceId);

    // Parse narrative content
    const overviewNotes = parseOverviewNarrative(content, this.sourceId);
    result.narrativeContent.generalNotes = overviewNotes.map((note) => ({
      source: this.sourceId,
      section: note.section,
      content: note.content,
    }));

    // Food interactions as harm reduction
    const foodInteractions = parseFoodInteractions(content, this.sourceId);
    if (foodInteractions.length > 0) {
      result.harmReduction = {
        rules: foodInteractions.map((f) => `Food interaction: ${f}`),
        sources: [this.sourceId],
      };
    }

    // Track extracted sections
    if (result.chemistry && Object.keys(result.chemistry).length > 1) {
      result.sectionsExtracted.push("chemistry");
    }
    if (result.pharmacology && Object.keys(result.pharmacology).length > 1) {
      result.sectionsExtracted.push("pharmacology");
    }
    if (result.interactions.length > 0) result.sectionsExtracted.push("interactions");
    if (result.harmReduction) result.sectionsExtracted.push("food_interactions");
    if (result.narrativeContent.generalNotes.length > 0) {
      result.sectionsExtracted.push("overview");
    }

    return result;
  }
}

export const drugBankParser = new DrugBankParser();
