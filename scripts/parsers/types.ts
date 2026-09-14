/**
 * Shared types for source parsers
 * All parsed data preserves source attribution for conflict resolution
 */

// === Dose/Duration Range Types ===

export interface DoseRange {
  min?: number;
  max?: number;
  unit: string; // µg, mg, g, ml
}

export interface DurationRange {
  min?: number;
  max?: number;
  unit: string; // minutes, hours
}

// === Parsed Section Types ===

export interface ParsedDosageRoute {
  route: string;
  source: string;
  confidence: "high" | "medium" | "low";
  bioavailability?: string;
  ranges: {
    threshold?: DoseRange;
    light?: DoseRange;
    common?: DoseRange;
    moderate?: DoseRange; // alias for common in some sources
    strong?: DoseRange;
    heavy?: DoseRange;
  };
  notes?: string;
}

export interface ParsedDurationRoute {
  route: string;
  source: string;
  confidence: "high" | "medium" | "low";
  stages: {
    onset?: DurationRange;
    comeUp?: DurationRange;
    peak?: DurationRange;
    offset?: DurationRange;
    afterEffects?: DurationRange;
    total?: DurationRange;
  };
}

export interface ParsedEffect {
  name: string;
  description?: string;
  category?: "positive" | "neutral" | "negative";
  source: string;
}

export interface ParsedInteraction {
  substance: string;
  severity: "dangerous" | "unsafe" | "caution" | "low-risk-synergy" | "low-risk-decrease" | "low-risk-no-synergy";
  description?: string;
  source: string;
}

export interface ParsedChemistry {
  smiles?: string;
  iupac?: string;
  formula?: string;
  cas?: string;
  inchi?: string;
  inchiKey?: string;
  molecularWeight?: string;
  sources: string[];
}

export interface ParsedPharmacology {
  mechanismOfAction?: string[];
  halfLife?: string;
  bioavailability?: string;
  metabolism?: string;
  receptors?: Array<{
    name: string;
    action: string; // agonist, antagonist, inhibitor, etc.
  }>;
  sources: string[];
}

export interface ParsedLegalStatus {
  country: string;
  status: string;
  details?: string;
  source: string;
}

export interface ParsedInternationalLaw {
  treaty: string;
  schedule?: string;
  notes?: string;
  source: string;
}

export interface ParsedHarmReduction {
  rules: string[];
  shortTermRisks?: string[];
  longTermRisks?: string[];
  contraindications?: string[];
  sources: string[];
}

export interface ParsedTolerance {
  /** Raw tolerance text extracted from source - to be formatted by LLM */
  rawText: string;
  source: string;
}

// === Narrative Content (preserved for LLM context) ===

export interface NarrativeContent {
  experienceReports: Array<{ source: string; content: string }>;
  synthesis: Array<{ source: string; content: string }>;
  qualitativeComments: Array<{ source: string; content: string }>;
  generalNotes: Array<{ source: string; section: string; content: string }>;
}

// === Main Parsed Substance Type ===

export interface ParsedSubstanceData {
  slug: string;
  name: string;

  // Tier 1: Direct extraction (high confidence)
  dosage: ParsedDosageRoute[];
  duration: ParsedDurationRoute[];
  chemistry?: ParsedChemistry;

  // Tier 2: Structured extraction (medium confidence)
  effects: ParsedEffect[];
  interactions: ParsedInteraction[];
  legal: ParsedLegalStatus[];
  internationalLaw: ParsedInternationalLaw[];
  tolerance?: ParsedTolerance[];
  pharmacology?: ParsedPharmacology;
  harmReduction?: ParsedHarmReduction;

  // Tier 3: Narrative content (for LLM context)
  narrativeContent: NarrativeContent;

  // Metadata
  sourcesCoverage: {
    sourceId: string;
    displayName: string;
    sectionsExtracted: string[];
    tokensOriginal: number;
  }[];
}

// === Parser Interface ===



export interface ParserResult {
  dosage: ParsedDosageRoute[];
  duration: ParsedDurationRoute[];
  chemistry?: Partial<ParsedChemistry>;
  effects: ParsedEffect[];
  interactions: ParsedInteraction[];
  legal: ParsedLegalStatus[];
  internationalLaw: ParsedInternationalLaw[];
  tolerance?: ParsedTolerance;
  pharmacology?: Partial<ParsedPharmacology>;
  harmReduction?: Partial<ParsedHarmReduction>;
  narrativeContent: Partial<NarrativeContent>;
  sectionsExtracted: string[];
}

export interface SourceParser {
  sourceId: string;
  parse(content: string, substanceName: string): ParserResult;
}

// === Aggregated Output ===

export interface ParsedSourcesOutput {
  generatedAt: string;
  version: string;
  stats: {
    totalSubstances: number;
    sourcesProcessed: string[];
    avgCoveragePerSubstance: number;
  };
  substances: Record<string, ParsedSubstanceData>;
}
