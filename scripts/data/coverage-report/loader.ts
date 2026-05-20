import * as fs from "fs";
import * as path from "path";

export interface ParsedData {
  substances: Record<string, SubstanceData>;
}

export interface SubstanceData {
  dosage: Array<{ route: string; source: string; ranges: Record<string, unknown> }>;
  duration: Array<{ route: string; source: string; stages: Record<string, unknown> }>;
  effects: Array<{ name: string; source: string }>;
  interactions: Array<{ substance: string; source: string; severity?: string; description?: string }>;
  legal: Array<{ country: string; status: string; source: string }>;
  tolerance: Array<{ source: string; rawText?: string }>;
  chemistry?: {
    sources: string[];
    formula?: string;
    smiles?: string;
    molecularWeight?: string;
    iupac?: string;
    cas?: string;
    inchiKey?: string;
  };
  pharmacology?: {
    sources: string[];
    halfLife?: string;
    metabolism?: string;
    receptors?: Array<{ name: string; action: string }>;
    mechanismOfAction?: string[];
    bioavailability?: string;
  };
  harmReduction?: {
    sources: string[];
    rules?: string[];
    shortTermRisks?: string[];
    longTermRisks?: string[];
    contraindications?: string[];
  };
  narrativeContent: {
    generalNotes: Array<{ source: string; section: string; content: string }>;
    experienceReports: Array<{ source: string; content: string }>;
    synthesis?: Array<{ source: string; content: string }>;
    qualitativeComments?: Array<{ source: string; content: string }>;
  };
}

export function loadData(
  dataPath = path.join(process.cwd(), "src/data/parsed-sources.json"),
): ParsedData {
  return JSON.parse(fs.readFileSync(dataPath, "utf-8"));
}
