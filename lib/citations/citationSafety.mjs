export const CITATION_ENTAILMENT_VERDICTS = Object.freeze([
  "entails",
  "partial",
  "does_not_entail",
  "uncertain",
]);

export const CITATION_SAFETY_CATEGORIES = Object.freeze([
  "overdose_or_death",
  "withdrawal_emergency",
  "seizure_risk",
  "lethal_dose_or_index",
  "interaction_severity_or_contraindication",
  "receptor_affinity_or_potency",
  "neuro_or_organ_toxicity",
  "potent_dosing",
  "pregnancy_or_neonatal",
]);

const SAFETY_RULES = Object.freeze([
  {
    category: "overdose_or_death",
    pattern: /\b(?:overdos(?:e|ed|ing)|fatal(?:ity|ities)?|death|deaths|mortality|life[- ]threatening)\b/i,
  },
  {
    category: "withdrawal_emergency",
    pattern: /\b(?:delirium tremens|severe withdrawal|withdrawal (?:emergency|emergencies|syndrome|seizure|seizures)|life[- ]threatening withdrawal)\b/i,
  },
  {
    category: "seizure_risk",
    pattern: /\b(?:seizure|seizures|convulsion|convulsions|status epilepticus)\b/i,
  },
  {
    category: "lethal_dose_or_index",
    pattern: /\b(?:lethal dose|median lethal|ld\s*[- ]?50|therapeutic (?:index|window)|safety ratio)\b/i,
  },
  {
    category: "interaction_severity_or_contraindication",
    pattern: /\b(?:contraindicat(?:ed|ion|ions)|dangerous interaction|severe interaction|interaction severity|must not (?:combine|mix|use)|serotonin syndrome)\b/i,
  },
  {
    category: "receptor_affinity_or_potency",
    pattern: /\b(?:binding affinity|receptor affinity|receptor potency|more potent|less potent|higher potency|lower potency|potency comparison|ki|kd|ic50|ec50)\b/i,
  },
  {
    category: "neuro_or_organ_toxicity",
    pattern: /\b(?:neurotoxic(?:ity)?|hepatotoxic(?:ity)?|cardiotoxic(?:ity)?|nephrotoxic(?:ity)?|organ toxicity|organ damage|liver damage|kidney damage|brain damage)\b/i,
  },
  {
    category: "potent_dosing",
    pattern: /\b(?:potent dos(?:e|es|ing)|microdos(?:e|es|ing)|micrograms?|µg|mcg|threshold dose|active dose|dose range|dosage)\b/i,
  },
  {
    category: "pregnancy_or_neonatal",
    pattern: /\b(?:pregnan(?:t|cy)|fetal|foetal|fetus|foetus|neonatal|newborn|placenta(?:l)?|breastfeed(?:ing)?|lactation)\b/i,
  },
]);

function normalizedValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedReferenceIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizedValue).filter(Boolean))].sort();
}

export function classifyCitationSafetyClaim({ fieldPath, claimKey, claimText } = {}) {
  const path = normalizedValue(fieldPath).toLowerCase();
  const haystack = [path, normalizedValue(claimKey), normalizedValue(claimText)]
    .filter(Boolean)
    .join(" \n ");
  const categories = new Set();

  // These excluded marker surfaces still require the strict route whenever a
  // workflow proposes factual publication changes within them.
  if (/^(?:article\.)?dosage(?:[.[]|$)/.test(path)) {
    categories.add("potent_dosing");
  }
  if (/^(?:article\.)?interactions(?:[.[]|$)/.test(path)) {
    categories.add("interaction_severity_or_contraindication");
  }

  for (const rule of SAFETY_RULES) {
    if (rule.pattern.test(haystack)) categories.add(rule.category);
  }

  return CITATION_SAFETY_CATEGORIES.filter((category) => categories.has(category));
}

export function requiresStrictCitationReview(claim) {
  return classifyCitationSafetyClaim(claim).length > 0;
}

export function isEntailingCitationVerdict(value) {
  return value === "entails";
}

export function validateStrictCitationReviewEvidence(row) {
  const strict = row?.strictReviewEvidence;
  const errors = [];
  if (!strict || typeof strict !== "object" || Array.isArray(strict)) {
    return ["strictReviewEvidence is required"];
  }

  if (strict.decision !== "approved") errors.push("strictReviewEvidence.decision must be approved");
  if (!normalizedValue(strict.reviewedBy)) errors.push("strictReviewEvidence.reviewedBy is required");
  if (!normalizedValue(strict.reviewedAt)) errors.push("strictReviewEvidence.reviewedAt is required");
  if (!normalizedValue(strict.rationale)) errors.push("strictReviewEvidence.rationale is required");
  if (normalizedValue(strict.claimKey) !== normalizedValue(row?.claimKey)) {
    errors.push("strictReviewEvidence.claimKey must match the reviewed claim");
  }
  if (normalizedValue(strict.fieldPath) !== normalizedValue(row?.fieldPath)) {
    errors.push("strictReviewEvidence.fieldPath must match the reviewed claim");
  }
  if (normalizedValue(strict.claimText) !== normalizedValue(row?.claimText)) {
    errors.push("strictReviewEvidence.claimText must match the reviewed claim");
  }
  if (JSON.stringify(normalizedReferenceIds(strict.referenceIds)) !== JSON.stringify(normalizedReferenceIds(row?.referenceIds))) {
    errors.push("strictReviewEvidence.referenceIds must match the reviewed evidence");
  }

  return errors;
}

export function citationEvidenceGateErrors(row) {
  const errors = [];
  if (!isEntailingCitationVerdict(row?.entailmentVerdict)) {
    errors.push("entailmentVerdict must be entails");
  }
  if (requiresStrictCitationReview(row)) {
    errors.push(...validateStrictCitationReviewEvidence(row));
  }
  return errors;
}
