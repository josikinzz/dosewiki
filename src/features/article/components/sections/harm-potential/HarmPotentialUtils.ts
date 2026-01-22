import type {
  SubstanceArticle,
  RiskLevel,
  CarcinogenicityLevel,
  EvidenceLevel,
  HarmPotential,
  Addiction,
  Toxicity
} from "@/schema";

// Type for old schema format (for backward compatibility)
interface OldHarmPotential {
  addiction_liability?: string;
  dependence_liability?: string;
  toxicity?: {
    ld50?: string;
    organ_toxicity?: string;
    carcinogenicity?: string;
    other?: string;
  };
  risks?: {
    psychosis?: string | { level?: RiskLevel | null; description?: string };
    seizure?: string | { level?: RiskLevel | null; description?: string };
    self_harm?: string | { level?: RiskLevel | null; description?: string };
    other?: string[];
  };
}

export interface NormalizedHarmPotential {
  addiction: {
    psychological: { level: RiskLevel | null; description: string };
    physical_dependence: { level: RiskLevel | null; description: string };
  };
  toxicity: {
    lethal_dosage: {
      ld50: Array<{ species?: string; route?: string; value?: number | null; unit?: string }>;
      notes: string;
    };
    // Legacy fields kept for backward compatibility with existing code that reads these directly
    ld50: Array<{ species?: string; route?: string; value?: number | null; unit?: string }>;
    ld50String: string;
    organ_toxicity: Array<{ system?: string; findings?: string; mechanism?: string; notes?: string }>;
    organToxicityString: string;
    carcinogenicity: {
      level: CarcinogenicityLevel | null;
      evidence?: any;
      description: string
    };
    antibiotic_function: {
      level: CarcinogenicityLevel | null; // reusing this type as per original usage or it might need casting
      description: string
    };
  };
  risks: {
    psychosis: { level: RiskLevel | null; description: string };
    seizure: { level: RiskLevel | null; description: string };
  };
  hasContent: {
    addiction: boolean;
    toxicity: boolean;
    risks: boolean;
    any: boolean;
  };
}

export function normalizeHarmPotential(article: SubstanceArticle): NormalizedHarmPotential | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hp = article.harm_potential as any;
  if (!hp) return null;

  // Detect old schema (has addiction_liability at top level, toxicity.ld50 is string, or risks wrapper)
  const isOldSchema =
    typeof hp.addiction_liability === "string" ||
    typeof hp.dependence_liability === "string" ||
    typeof hp.toxicity?.ld50 === "string" ||
    hp.risks !== undefined; // Old schema has risks wrapper

  // Normalize addiction
  const addiction = isOldSchema
    ? {
        psychological: { level: null as RiskLevel | null, description: (hp as OldHarmPotential).addiction_liability || "" },
        physical_dependence: { level: null as RiskLevel | null, description: (hp as OldHarmPotential).dependence_liability || "" },
      }
    : hp.addiction || { psychological: { level: null, description: "" }, physical_dependence: { level: null, description: "" } };

  // Ensure structure even if fields are missing in new schema
  const normalizedAddiction = {
    psychological: addiction.psychological || { level: null, description: "" },
    physical_dependence: addiction.physical_dependence || { level: null, description: "" }
  };

  // Normalize ld50 - check new lethal_dosage format first, fall back to legacy ld50
  let ld50Array: Array<{ species?: string; route?: string; value?: number | null; unit?: string }> = [];
  let ld50String = "";
  let lethalDosageNotes = "";

  // Check for new format: toxicity.lethal_dosage.ld50 / toxicity.lethal_dosage.notes
  if (hp.toxicity?.lethal_dosage) {
    if (Array.isArray(hp.toxicity.lethal_dosage.ld50)) {
      ld50Array = hp.toxicity.lethal_dosage.ld50;
    }
    if (typeof hp.toxicity.lethal_dosage.notes === "string") {
      lethalDosageNotes = hp.toxicity.lethal_dosage.notes;
    }
  }
  // Fall back to legacy format: toxicity.ld50 (array or string)
  if (ld50Array.length === 0 && !lethalDosageNotes) {
    if (Array.isArray(hp.toxicity?.ld50)) {
      ld50Array = hp.toxicity.ld50;
    } else if (typeof hp.toxicity?.ld50 === "string") {
      // Legacy string format - normalize into notes field
      ld50String = hp.toxicity.ld50;
      lethalDosageNotes = hp.toxicity.ld50;
    }
  }

  // Normalize organ_toxicity
  const organToxicityArray = Array.isArray(hp.toxicity?.organ_toxicity) ? hp.toxicity.organ_toxicity : [];
  const organToxicityString = typeof hp.toxicity?.organ_toxicity === "string" ? hp.toxicity.organ_toxicity : "";

  // Normalize carcinogenicity
  const carcinogenicity =
    typeof hp.toxicity?.carcinogenicity === "string"
      ? { level: null as CarcinogenicityLevel | null, evidence: null, description: hp.toxicity.carcinogenicity }
      : hp.toxicity?.carcinogenicity || { level: null, evidence: null, description: "" };

  // Normalize antibiotic_function (new schema only)
  const antibioticFunction = hp.toxicity?.antibiotic_function || { level: null, description: "" };

  // Normalize psychosis and seizure - handle both old (under risks) and new (top-level) schema
  const normalizeRiskField = (
    topLevel: { level?: RiskLevel | null; description?: string } | undefined,
    risksLevel: string | { level?: RiskLevel | null; description?: string } | undefined
  ): { level: RiskLevel | null; description: string } => {
    // New schema: top-level field
    if (topLevel && typeof topLevel === "object" && "description" in topLevel) {
      return { level: topLevel.level || null, description: topLevel.description || "" };
    }
    // Old schema: under risks wrapper
    if (typeof risksLevel === "string") {
      return { level: null, description: risksLevel };
    }
    if (risksLevel && typeof risksLevel === "object" && "description" in risksLevel) {
      return { level: risksLevel.level || null, description: risksLevel.description || "" };
    }
    return { level: null, description: "" };
  };

  const psychosis = normalizeRiskField(hp.psychosis, hp.risks?.psychosis);
  const seizure = normalizeRiskField(hp.seizure, hp.risks?.seizure);

  // Check for content
  const hasAddiction =
    (normalizedAddiction.psychological.description || "").trim().length > 0 ||
    (normalizedAddiction.physical_dependence.description || "").trim().length > 0;

  const hasLD50 = ld50Array.length > 0 || ld50String.trim().length > 0 || lethalDosageNotes.trim().length > 0;
  const hasOrganToxicity = organToxicityArray.length > 0 || organToxicityString.trim().length > 0;
  // Only count carcinogenicity as having content if level is not unknown/no_evidence
  const hasCarcinogenicity =
    carcinogenicity.level !== 'unknown' && carcinogenicity.level !== 'no_evidence' &&
    ((carcinogenicity.description || "").trim().length > 0 || carcinogenicity.level != null);
  // Only count antibiotic_function as having content if level is not unknown/no_evidence
  const hasAntibioticFunction =
    antibioticFunction.level !== 'unknown' && antibioticFunction.level !== 'no_evidence' &&
    ((antibioticFunction.description || "").trim().length > 0 || antibioticFunction.level != null);

  const hasToxicity = hasLD50 || hasOrganToxicity || hasCarcinogenicity || hasAntibioticFunction;

  const hasPsychosis = (psychosis.description || "").trim().length > 0;
  const hasSeizure = (seizure.description || "").trim().length > 0;
  const hasRisks = hasPsychosis || hasSeizure;

  if (!hasAddiction && !hasToxicity && !hasRisks) {
    return null;
  }

  return {
    addiction: normalizedAddiction,
    toxicity: {
      lethal_dosage: {
        ld50: ld50Array,
        notes: lethalDosageNotes
      },
      // Legacy fields kept for backward compatibility
      ld50: ld50Array,
      ld50String,
      organ_toxicity: organToxicityArray,
      organToxicityString,
      carcinogenicity,
      antibiotic_function: antibioticFunction
    },
    risks: {
      psychosis,
      seizure
    },
    hasContent: {
      addiction: hasAddiction,
      toxicity: hasToxicity,
      risks: hasRisks,
      any: true
    }
  };
}
