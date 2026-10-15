export interface DoseRange {
  min?: number;
  max?: number;
  unit: string;
}

export interface DurationRange {
  min?: number;
  max?: number;
  unit: string;
}

export interface ParsedDosageRoute {
  route: string;
  source: string;
  confidence: "high" | "medium" | "low";
  bioavailability?: string;
  ranges: {
    threshold?: DoseRange;
    light?: DoseRange;
    common?: DoseRange;
    moderate?: DoseRange;
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
    action: string;
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
  rawText: string;
  source: string;
}

export interface NarrativeContent {
  experienceReports: Array<{ source: string; content: string }>;
  synthesis: Array<{ source: string; content: string }>;
  qualitativeComments: Array<{ source: string; content: string }>;
  generalNotes: Array<{ source: string; section: string; content: string }>;
}

export interface ParsedSubstanceData {
  slug: string;
  name: string;

  dosage: ParsedDosageRoute[];
  duration: ParsedDurationRoute[];
  chemistry?: ParsedChemistry;

  effects: ParsedEffect[];
  interactions: ParsedInteraction[];
  legal: ParsedLegalStatus[];
  internationalLaw: ParsedInternationalLaw[];
  tolerance?: ParsedTolerance[];
  pharmacology?: ParsedPharmacology;
  harmReduction?: ParsedHarmReduction;

  narrativeContent: NarrativeContent;

  sourcesCoverage: {
    sourceId: string;
    displayName: string;
    sectionsExtracted: string[];
    tokensOriginal: number;
  }[];
}

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
