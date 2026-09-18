export {
  CITATION_SAFETY_CATEGORIES,
  classifyCitationSafetyClaim,
  requiresStrictCitationReview,
} from "../../lib/citations/citationSafety.mjs";

export const FORMAL_CITATION_SECTION_CONFIG = Object.freeze([
  {
    key: "summary",
    legacyKey: "summary",
    label: "Summary",
    quoteSectionId: "summary",
    promptKey: "formal_citations_section_summary",
    severity: "blocking",
    sourceNeedles: ["summary", "overview", "synthesized", "class"],
  },
  {
    key: "pharmacology",
    legacyKey: "pharmacology",
    label: "Pharmacology",
    quoteSectionId: "pharmacology",
    promptKey: "formal_citations_section_pharmacology",
    severity: "blocking",
    sourceNeedles: ["pharmacology", "mechanism", "receptor", "metabolism"],
  },
  {
    key: "harm_potential",
    legacyKey: "harm-potential",
    label: "Harm Potential",
    quoteSectionId: "harm_potential",
    promptKey: "formal_citations_section_harm_potential",
    severity: "blocking",
    sourceNeedles: ["harm", "toxicity", "risk", "addiction"],
  },
  {
    key: "legality",
    legacyKey: "legality",
    label: "Legality",
    quoteSectionId: "legality",
    promptKey: "formal_citations_section_legality",
    severity: "blocking",
    sourceNeedles: ["legality", "legal", "schedule", "controlled"],
  },
  {
    key: "history_culture",
    legacyKey: "history-culture",
    label: "History & Culture",
    quoteSectionId: "history_culture",
    promptKey: "formal_citations_section_history_culture",
    severity: "non_blocking",
    sourceNeedles: ["history", "culture", "discovery"],
  },
  {
    key: "tolerance",
    legacyKey: "tolerance",
    label: "Tolerance",
    quoteSectionId: "tolerance",
    promptKey: "formal_citations_section_tolerance",
    severity: "blocking",
    sourceNeedles: ["tolerance", "cross-tolerance"],
  },
]);

export const FORMAL_CITATION_SECTIONS = Object.freeze(
  FORMAL_CITATION_SECTION_CONFIG.map((entry) => entry.key),
);

// Canonical citable article surface, in article order. Every entry must exist
// in FORMAL_CITATION_SECTION_CONFIG (and vice versa) so the two cannot drift.
const CITABLE_ARTICLE_SURFACE_ORDER = Object.freeze([
  "summary",
  "pharmacology",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
]);

export const CITABLE_ARTICLE_SURFACE = Object.freeze(
  CITABLE_ARTICLE_SURFACE_ORDER.map((key) => {
    const descriptor = FORMAL_CITATION_SECTION_CONFIG.find((entry) => entry.key === key);
    if (!descriptor) {
      throw new Error(`Citable surface section ${key} is missing from FORMAL_CITATION_SECTION_CONFIG.`);
    }
    return descriptor.key;
  }),
);

if (CITABLE_ARTICLE_SURFACE.length !== FORMAL_CITATION_SECTION_CONFIG.length) {
  throw new Error(
    "FORMAL_CITATION_SECTION_CONFIG defines sections outside CITABLE_ARTICLE_SURFACE; keep the citable surface order in sync.",
  );
}

// Article sections that must never receive new public [cite:*] markers.
export const EXCLUDED_CITATION_SURFACE = Object.freeze([
  "dosage",
  "duration",
  "subjective_effects",
  "comparisons",
  "reagent_testing",
  "interactions",
  "identification",
  "classification",
]);

export function isCitableSection(sectionKey) {
  return CITABLE_ARTICLE_SURFACE.includes(sectionKey);
}

export function isExcludedCitationSection(sectionKey) {
  return EXCLUDED_CITATION_SURFACE.includes(sectionKey);
}

const SECTION_LOOKUP = new Map();
for (const descriptor of FORMAL_CITATION_SECTION_CONFIG) {
  SECTION_LOOKUP.set(descriptor.key, descriptor);
  SECTION_LOOKUP.set(descriptor.legacyKey, descriptor);
}

export function normalizeFormalCitationSectionKey(value) {
  if (typeof value !== "string") return null;
  return SECTION_LOOKUP.get(value.trim())?.key ?? null;
}

export function getFormalCitationSectionConfig(sectionKey) {
  const normalized = normalizeFormalCitationSectionKey(sectionKey);
  if (!normalized) {
    throw new Error(`Unknown formal citation section: ${sectionKey}`);
  }
  return SECTION_LOOKUP.get(normalized);
}

export function hasCitableTolerance(article) {
  const tolerance = article?.tolerance ?? {};
  return Object.values(tolerance).some((value) => {
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.some((entry) => typeof entry === "string" && entry.trim());
    return false;
  });
}

export function resolveFormalCitationSections({ article, requestedSection = null, requestedSections = [] }) {
  const requested = [
    ...(requestedSection ? [requestedSection] : []),
    ...requestedSections,
  ];

  if (requested.length === 0) {
    return FORMAL_CITATION_SECTION_CONFIG
      .filter((descriptor) => descriptor.key !== "tolerance" || hasCitableTolerance(article))
      .map((descriptor) => descriptor.key);
  }

  const deduped = [];
  for (const value of requested) {
    const normalized = normalizeFormalCitationSectionKey(value);
    if (!normalized) {
      throw new Error(`Unknown formal citation section: ${value}`);
    }
    if (!deduped.includes(normalized)) {
      deduped.push(normalized);
    }
  }
  return deduped;
}
