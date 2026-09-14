import type { ParsedChemistry, ParsedPharmacology, ParserResult, SourceParser } from "../types";
import {
  cleanMarkdown,
  createEmptyParserResult,
  detectInteractionSeverity,
  extractBulletList,
  extractSection,
  extractStatusAndNotes,
  extractSubsections,
  normalizeCountry,
  stripReferences,
} from "../base";
import { getParseableSourceDescriptor } from "../source-identity";

class WikipediaParser implements SourceParser {
  source = getParseableSourceDescriptor("wikipedia");
  sourceId = this.source.id;

  parse(content: string, _substanceName: string): ParserResult {
    const result = createEmptyParserResult();
    const cleanSectionText = (text: string): string => {
      let cleaned = stripReferences(cleanMarkdown(text)).replace(/\s+/g, " ").trim();
      cleaned = cleaned.replace(
        /^((Pharmacokinetics|Pharmacology|Metabolism|Absorption|Elimination|Bioavailability|Half-life)\s+)+/i,
        "",
      );
      cleaned = cleaned.replace(/\s*citation needed\s*/gi, " ").trim();
      if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) cleaned += ".";
      return cleaned;
    };

    const pharmacoSection = extractSection(content, "Pharmacology", 2);
    if (pharmacoSection) {
      const pharmacology: Partial<ParsedPharmacology> = { sources: [this.sourceId] };
      const subsections = extractSubsections(pharmacoSection, 3);
      const halfLifeSubsection = subsections.get("half-life") || subsections.get("elimination");
      if (halfLifeSubsection) {
        const cleaned = cleanSectionText(halfLifeSubsection);
        if (cleaned.length > 10) pharmacology.halfLife = cleaned;
      }
      const bioSubsection = subsections.get("bioavailability") || subsections.get("absorption");
      if (bioSubsection) {
        const cleaned = cleanSectionText(bioSubsection);
        if (cleaned.length > 10) pharmacology.bioavailability = cleaned;
      }
      const metabolismSubsection = subsections.get("metabolism");
      if (metabolismSubsection) {
        const cleaned = cleanSectionText(metabolismSubsection);
        if (cleaned.length > 10) pharmacology.metabolism = cleaned;
      }
      if (!pharmacology.halfLife && !pharmacology.bioavailability && !pharmacology.metabolism) {
        const fullSection = cleanSectionText(pharmacoSection);
        if (fullSection.length > 50) pharmacology.metabolism = fullSection;
      }
      if (Object.keys(pharmacology).length > 1) {
        result.pharmacology = pharmacology;
        result.sectionsExtracted.push("pharmacology");
      }
      const pharmacoNarrative = cleanSectionText(pharmacoSection);
      if (pharmacoNarrative.length >= 100) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "pharmacology",
          content: pharmacoNarrative,
        });
      }
    }

    let legalSection = extractSection(content, "Legal status", 2);
    if (!legalSection) legalSection = extractSection(content, "Regulation", 2);
    if (!legalSection) legalSection = extractSection(content, "Regulations", 2);
    if (!legalSection) legalSection = extractSection(content, "Legality", 2);
    if (!legalSection) {
      const societySection = extractSection(content, "Society and culture", 2);
      if (societySection) {
        legalSection = extractSection(societySection, "Legal status", 3);
        if (!legalSection) legalSection = extractSection(societySection, "Regulation", 3);
        if (!legalSection) legalSection = extractSection(societySection, "Regulations", 3);
        if (!legalSection) legalSection = extractSection(societySection, "Legality", 3);
      }
    }
    if (!legalSection) legalSection = extractSection(content, "Legal status", 3);
    if (!legalSection) legalSection = extractSection(content, "Regulation", 3);
    if (!legalSection) legalSection = extractSection(content, "Regulations", 3);

    if (legalSection) {
      const intlSection =
        extractSection(legalSection, "International law", 4) ||
        extractSection(legalSection, "International", 4);
      const intlNotes = intlSection ? cleanMarkdown(intlSection).trim() : "";
      if (legalSection.includes("1971 Convention") || legalSection.includes("Convention on Psychotropic Substances")) {
        result.internationalLaw.push({
          treaty: "UN Convention on Psychotropic Substances 1971",
          notes: intlNotes || undefined,
          source: this.sourceId,
        });
      }
      if (legalSection.includes("1961 Convention") || legalSection.includes("Single Convention on Narcotic")) {
        result.internationalLaw.push({
          treaty: "Single Convention on Narcotic Drugs 1961",
          notes: intlNotes || undefined,
          source: this.sourceId,
        });
      }
      if (legalSection.includes("1988 Convention") || legalSection.includes("Against Illicit Traffic")) {
        result.internationalLaw.push({
          treaty: "UN Convention Against Illicit Traffic 1988",
          notes: intlNotes || undefined,
          source: this.sourceId,
        });
      }

      const linePattern = /^([A-Z][A-Za-z\s]+)\s+[-–—]\s+(.+)$/gm;
      let match: RegExpExecArray | null;
      while ((match = linePattern.exec(legalSection)) !== null) {
        const countryRaw = match[1].trim();
        const description = match[2].trim();
        const skipTerms = ["see also", "references", "asia", "europe", "north-america", "oceania", "other"];
        if (skipTerms.some((term) => countryRaw.toLowerCase().includes(term))) continue;
        const normalized = normalizeCountry(countryRaw);
        if (normalized && description) {
          const { status, notes } = extractStatusAndNotes(description);
          result.legal.push({
            country: normalized,
            status,
            details: notes || undefined,
            source: this.sourceId,
          });
        }
      }

      if (result.legal.length === 0) {
        const headerPattern = /#{3,4}\s*([^\n]+)([\s\S]*?)(?=#{3,4}|##|$)/gi;
        while ((match = headerPattern.exec(legalSection)) !== null) {
          const headerText = match[1].trim();
          const fullText = cleanMarkdown(match[2]);
          const skipHeaders = [
            "see also",
            "references",
            "international law",
            "by continent",
            "fda",
            "dea",
            "public response",
            "scheduling",
            "assessment",
            "asean",
            "south america",
            "europe",
            "asia",
            "north america",
            "oceania",
            "africa",
            "middle east",
            "regulation",
            "regulations",
            "legal status",
            "legality",
            "age limits",
            "historic",
            "history",
          ];
          if (skipHeaders.some((term) => headerText.toLowerCase().includes(term))) continue;
          if (!headerText || !fullText) continue;
          const normalized = normalizeCountry(headerText);
          if (normalized) {
            const { status, notes } = extractStatusAndNotes(fullText);
            result.legal.push({
              country: normalized,
              status,
              details: notes || undefined,
              source: this.sourceId,
            });
          }
        }
      }

      if (result.legal.length === 0) {
        const prosePattern = /\bIn\s+((?:the\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+\w+\s+(?:is|are)\s+(?:classified as\s+)?(?:a\s+)?(.+?)(?:\.|$)/gm;
        while ((match = prosePattern.exec(legalSection)) !== null) {
          let countryRaw = match[1].trim();
          const statusText = match[2].trim();
          countryRaw = countryRaw.replace(/^the\s+/i, "");
          const normalized = normalizeCountry(countryRaw);
          if (normalized && statusText) {
            const { status, notes } = extractStatusAndNotes(statusText);
            result.legal.push({
              country: normalized,
              status: status || statusText,
              details: notes || undefined,
              source: this.sourceId,
            });
          }
        }
      }

      if (result.legal.length === 0) {
        const skipWords = ["which", "that", "this", "some", "many", "most", "all", "any", "certain"];
        const byActPattern =
          /(?:a\s+)?((?:Schedule|Class|List|Anlage)\s+[^\s,]+(?:\s+\w+)?)\s+(?:by|under)\s+(?:the\s+)?[^,]+?\s+in\s+(?:the\s+)?([A-Z]{2,3}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=\s*[,.\s]|$)/gi;
        while ((match = byActPattern.exec(legalSection)) !== null) {
          const statusRaw = match[1].trim();
          const countryRaw = match[2].trim();
          if (statusRaw.length > 60) continue;
          if (skipWords.includes(countryRaw.toLowerCase())) continue;
          const normalized = normalizeCountry(countryRaw);
          if (normalized) {
            result.legal.push({
              country: normalized,
              status: statusRaw,
              source: this.sourceId,
            });
          }
        }

        const directPattern =
          /(?:a\s+)?([^,.]+?)\s+in\s+(?:the\s+)?([A-Z]{2,3}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=\s*[,.\s]|$)/gi;
        while ((match = directPattern.exec(legalSection)) !== null) {
          const statusRaw = match[1].trim().replace(/^and\s+/i, "");
          const countryRaw = match[2].trim();
          if (statusRaw.length > 80) continue;
          if (!statusRaw.match(/schedule|class|list|anlage|controlled|illegal|legal|substance/i)) continue;
          if (skipWords.includes(countryRaw.toLowerCase())) continue;
          if (statusRaw.match(/\s+(?:by|under)\s+(?:the\s+)?(?:\w+\s+){2,}/i)) continue;
          const normalized = normalizeCountry(countryRaw);
          if (normalized && !result.legal.some((entry) => entry.country === normalized)) {
            result.legal.push({
              country: normalized,
              status: statusRaw,
              source: this.sourceId,
            });
          }
        }
      }

      if (result.legal.length > 0) result.sectionsExtracted.push("legal");
      if (result.internationalLaw.length > 0) result.sectionsExtracted.push("international_law");
    }

    let adverseSection = extractSection(content, "Adverse effects", 2);
    if (!adverseSection) adverseSection = extractSection(content, "Adverse effects", 3);
    if (!adverseSection) adverseSection = extractSection(content, "Adverse effects", 4);
    if (!adverseSection) adverseSection = extractSection(content, "Side effects", 2);
    if (adverseSection) {
      const bullets = extractBulletList(adverseSection);
      for (const bullet of bullets) {
        const cleaned = cleanMarkdown(bullet);
        if (cleaned.length > 3 && cleaned.length < 100) {
          result.effects.push({
            name: cleaned,
            category: "negative",
            source: this.sourceId,
          });
        }
      }
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

    let contraSection = extractSection(content, "Contraindications", 2);
    if (!contraSection) contraSection = extractSection(content, "Contraindications", 3);
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

    const chemistrySection = extractSection(content, "Chemistry", 2);
    if (chemistrySection) {
      const chemistry: Partial<ParsedChemistry> = { sources: [this.sourceId] };
      const smilesMatch = chemistrySection.match(/\*?\*?SMILES:?\*?\*?\s*([A-Za-z0-9@+\-[\]\\/()=#]+)/i);
      if (smilesMatch) {
        const smiles = smilesMatch[1].trim();
        if (smiles.length >= 3) chemistry.smiles = smiles;
      }
      const formulaMatch = chemistrySection.match(/molecular formula[:\s]+(?:of\s+)?([A-Za-z0-9−]+)/i);
      if (formulaMatch) chemistry.formula = formulaMatch[1].replace(/−/g, "").trim();
      const weightMatch = chemistrySection.match(/molecular weight[:\s]+(?:of\s+)?([^.]+g\/mol)/i);
      if (weightMatch) chemistry.molecularWeight = weightMatch[1].trim();
      const inchiMatch = chemistrySection.match(/InChI[=:\s]+([^\n]+)/i);
      if (inchiMatch) chemistry.inchi = inchiMatch[1].trim();
      if (Object.keys(chemistry).length > 1) {
        result.chemistry = chemistry;
        result.sectionsExtracted.push("chemistry");
      }
      const chemNarrative = stripReferences(cleanMarkdown(chemistrySection));
      if (chemNarrative.length >= 100) {
        result.narrativeContent.generalNotes.push({
          source: this.sourceId,
          section: "chemistry",
          content: chemNarrative,
        });
      }
    }

    const interactionsSection = extractSection(content, "Interactions", 2);
    if (interactionsSection) {
      const bullets = extractBulletList(interactionsSection);
      for (const bullet of bullets) {
        const cleaned = cleanMarkdown(bullet);
        const substanceMatch = cleaned.match(/^\*?\*?([^*\-–:]+)/);
        if (substanceMatch) {
          const substance = substanceMatch[1].trim();
          if (substance.length >= 2 && substance.length < 50) {
            result.interactions.push({
              substance,
              severity: detectInteractionSeverity(cleaned),
              description: cleaned,
              source: this.sourceId,
            });
          }
        }
      }
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

    const leadMatch = content.match(/^#\s*[^\n]+\n\*[^\n]+\*\n\n([\s\S]*?)(?=\n##)/);
    if (leadMatch) {
      result.narrativeContent.generalNotes.push({
        source: this.sourceId,
        section: "overview",
        content: stripReferences(cleanMarkdown(leadMatch[1])),
      });
    }

    for (const [sectionName, key] of [
      ["Uses", "uses"],
      ["Overdose", "overdose"],
      ["History", "history"],
      ["Effects", "effects"],
    ] as const) {
      const section = extractSection(content, sectionName, 2);
      if (section) {
        const narrative = stripReferences(cleanMarkdown(section));
        if (narrative.length >= 100) {
          result.narrativeContent.generalNotes.push({
            source: this.sourceId,
            section: key,
            content: narrative,
          });
          if (key !== "effects") result.sectionsExtracted.push(key);
        }
      }
    }

    const dependenceSection =
      extractSection(content, "Dependence and withdrawal", 2) ||
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

    return result;
  }
}

export const wikipediaParser = new WikipediaParser();
