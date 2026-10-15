import type {
  SubstanceArticle,
  RiskLevel,
  CarcinogenicityLevel,
} from "@/schema";

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
    ld50: Array<{ species?: string; route?: string; value?: number | null; unit?: string }>;
    ld50String: string;
    organ_toxicity: Array<{ system?: string; findings?: string; mechanism?: string; notes?: string }>;
    organToxicityString: string;
    carcinogenicity: {
      level: CarcinogenicityLevel | null;
      evidence?: unknown;
      description: string
    };
    antibiotic_function: {
      level: CarcinogenicityLevel | null;
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

type CarcinogenicityObject = {
  level?: CarcinogenicityLevel | null;
  evidence?: unknown;
  description?: string;
};

type ToxicityDescriptor = {
  level: CarcinogenicityLevel | null;
  description: string;
};

const normalizeToxicityDescriptor = (
  value: string | { level?: CarcinogenicityLevel | null; description?: string } | null | undefined,
): ToxicityDescriptor => {
  if (typeof value === "string") {
    return { level: null, description: value };
  }

  if (value && typeof value === "object") {
    return {
      level: value.level ?? null,
      description: value.description ?? "",
    };
  }

  return { level: null, description: "" };
};

export function normalizeHarmPotential(article: SubstanceArticle): NormalizedHarmPotential | null {
  const hp = article.harm_potential as (SubstanceArticle["harm_potential"] & OldHarmPotential) | null | undefined;
  if (!hp) return null;

  const isOldSchema =
    typeof hp.addiction_liability === "string" ||
    typeof hp.dependence_liability === "string" ||
    typeof hp.toxicity?.ld50 === "string" ||
    hp.risks !== undefined;

  const addiction = isOldSchema
    ? {
        psychological: { level: null as RiskLevel | null, description: hp.addiction_liability || "" },
        physical_dependence: { level: null as RiskLevel | null, description: hp.dependence_liability || "" },
      }
    : hp.addiction || { psychological: { level: null, description: "" }, physical_dependence: { level: null, description: "" } };

  const normalizedAddiction: NormalizedHarmPotential["addiction"] = {
    psychological: {
      level: addiction.psychological?.level ?? null,
      description: addiction.psychological?.description ?? "",
    },
    physical_dependence: {
      level: addiction.physical_dependence?.level ?? null,
      description: addiction.physical_dependence?.description ?? "",
    },
  };

  let ld50Array: Array<{ species?: string; route?: string; value?: number | null; unit?: string }> = [];
  let ld50String = "";
  let lethalDosageNotes = "";

  if (hp.toxicity?.lethal_dosage) {
    if (Array.isArray(hp.toxicity.lethal_dosage.ld50)) {
      ld50Array = hp.toxicity.lethal_dosage.ld50;
    }
    if (typeof hp.toxicity.lethal_dosage.notes === "string") {
      lethalDosageNotes = hp.toxicity.lethal_dosage.notes;
    }
  }
  if (ld50Array.length === 0 && !lethalDosageNotes) {
    if (Array.isArray(hp.toxicity?.ld50)) {
      ld50Array = hp.toxicity.ld50;
    } else if (typeof hp.toxicity?.ld50 === "string") {
      ld50String = hp.toxicity.ld50;
      lethalDosageNotes = hp.toxicity.ld50;
    }
  }

  const organToxicityArray = Array.isArray(hp.toxicity?.organ_toxicity) ? hp.toxicity.organ_toxicity : [];
  const organToxicityString = typeof hp.toxicity?.organ_toxicity === "string" ? hp.toxicity.organ_toxicity : "";

  const rawCarcinogenicity = hp.toxicity?.carcinogenicity;
  const carcinogenicity =
    typeof rawCarcinogenicity === "string"
      ? { level: null as CarcinogenicityLevel | null, evidence: null, description: rawCarcinogenicity }
      : rawCarcinogenicity && typeof rawCarcinogenicity === "object"
        ? {
            level: (rawCarcinogenicity as CarcinogenicityObject).level ?? null,
            evidence: (rawCarcinogenicity as CarcinogenicityObject).evidence ?? null,
            description: (rawCarcinogenicity as CarcinogenicityObject).description ?? "",
          }
        : { level: null as CarcinogenicityLevel | null, evidence: null, description: "" };

  const antibioticFunction = normalizeToxicityDescriptor(hp.toxicity?.antibiotic_function);

  const normalizeRiskField = (
    topLevel: { level?: RiskLevel | null; description?: string } | undefined,
    risksLevel: string | { level?: RiskLevel | null; description?: string } | undefined
  ): { level: RiskLevel | null; description: string } => {
    if (topLevel && typeof topLevel === "object" && "description" in topLevel) {
      return { level: topLevel.level || null, description: topLevel.description || "" };
    }
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

  const hasAddiction =
    (normalizedAddiction.psychological.description || "").trim().length > 0 ||
    (normalizedAddiction.physical_dependence.description || "").trim().length > 0;

  const hasLD50 = ld50Array.length > 0 || ld50String.trim().length > 0 || lethalDosageNotes.trim().length > 0;
  const hasOrganToxicity = organToxicityArray.length > 0 || organToxicityString.trim().length > 0;
  const hasCarcinogenicity =
    carcinogenicity.level !== 'unknown' && carcinogenicity.level !== 'no_evidence' &&
    ((carcinogenicity.description || "").trim().length > 0 || carcinogenicity.level != null);
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
