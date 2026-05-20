import yaml from "yaml";

export const VALID_RISK_LEVELS = ["extremely_low", "low", "moderate", "high", "extremely_high", null];
export const VALID_CARCINOGENICITY_LEVELS = ["confirmed", "probable", "possible", "no_evidence", "unknown", null];

export function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function hasExistingHarmPotential(article) {
  const hp = article.harm_potential;
  if (!hp) return false;

  const hasNewFormat = !!(
    hp.addiction?.psychological?.description?.trim() ||
    hp.addiction?.physical_dependence?.description?.trim() ||
    hp.toxicity?.ld50?.length > 0 ||
    hp.toxicity?.organ_toxicity?.length > 0 ||
    hp.toxicity?.carcinogenicity?.description?.trim() ||
    hp.toxicity?.antibiotic_function?.description?.trim() ||
    hp.psychosis?.description?.trim() ||
    hp.seizure?.description?.trim()
  );

  const hasOldFormat = !!(
    hp.addiction_liability?.trim() ||
    hp.dependence_liability?.trim() ||
    (typeof hp.toxicity?.ld50 === "string" && hp.toxicity.ld50?.trim()) ||
    (typeof hp.toxicity?.organ_toxicity === "string" && hp.toxicity.organ_toxicity?.trim()) ||
    hp.risks?.psychosis?.description?.trim() ||
    hp.risks?.seizure?.description?.trim() ||
    (typeof hp.risks?.psychosis === "string" && hp.risks.psychosis?.trim()) ||
    (typeof hp.risks?.seizure === "string" && hp.risks.seizure?.trim())
  );

  return hasNewFormat || hasOldFormat;
}

export function hasNewSchemaHarmPotential(article) {
  const hp = article.harm_potential;
  if (!hp) return false;

  return !!(
    hp.psychosis?.level ||
    hp.psychosis?.description?.trim() ||
    hp.addiction?.psychological?.level ||
    hp.addiction?.psychological?.description?.trim()
  );
}

export function buildUserMessage(article, quotes) {
  const context = {
    title: article.title,
    psychoactive_class: article.classification?.psychoactive_class || [],
    chemical_class: article.classification?.chemical_class || [],
  };

  return `## Substance

**${context.title}**
- Psychoactive class: ${context.psychoactive_class.join(", ") || "Unknown"}
- Chemical class: ${context.chemical_class.join(", ") || "Unknown"}

## Source Material

Generate the harm_potential section based on these extracted quotes:

${quotes}

## Instructions

Generate ONLY the harm_potential section as valid YAML. Do not include information that belongs in other sections (pharmacology, interactions, tolerance, dosage, duration, legality).`;
}

export function normalizeHarmPotential(hp) {
  const lethalDosage = hp.toxicity?.lethal_dosage;
  const legacyLd50 = hp.toxicity?.ld50;

  let ld50Array = [];
  if (Array.isArray(lethalDosage?.ld50)) {
    ld50Array = lethalDosage.ld50;
  } else if (Array.isArray(legacyLd50)) {
    ld50Array = legacyLd50;
  }

  const normalized = {
    addiction: {
      psychological: {
        level: hp.addiction?.psychological?.level ?? null,
        description: hp.addiction?.psychological?.description ?? "",
      },
      physical_dependence: {
        level: hp.addiction?.physical_dependence?.level ?? null,
        description: hp.addiction?.physical_dependence?.description ?? "",
      },
    },
    toxicity: {
      lethal_dosage: {
        notes: lethalDosage?.notes ?? "",
        ld50: ld50Array,
      },
      organ_toxicity: Array.isArray(hp.toxicity?.organ_toxicity) ? hp.toxicity.organ_toxicity : [],
      carcinogenicity: {
        level: hp.toxicity?.carcinogenicity?.level ?? null,
        evidence: hp.toxicity?.carcinogenicity?.evidence ?? null,
        description: hp.toxicity?.carcinogenicity?.description ?? "",
      },
      antibiotic_function: {
        level: hp.toxicity?.antibiotic_function?.level ?? null,
        description: hp.toxicity?.antibiotic_function?.description ?? "",
      },
    },
    psychosis: {
      level: hp.psychosis?.level ?? null,
      description: hp.psychosis?.description ?? "",
    },
    seizure: {
      level: hp.seizure?.level ?? null,
      description: hp.seizure?.description ?? "",
    },
  };

  if (!VALID_RISK_LEVELS.includes(normalized.addiction.psychological.level)) {
    normalized.addiction.psychological.level = null;
  }
  if (!VALID_RISK_LEVELS.includes(normalized.addiction.physical_dependence.level)) {
    normalized.addiction.physical_dependence.level = null;
  }
  if (!VALID_CARCINOGENICITY_LEVELS.includes(normalized.toxicity.carcinogenicity.level)) {
    normalized.toxicity.carcinogenicity.level = null;
  }
  if (!VALID_CARCINOGENICITY_LEVELS.includes(normalized.toxicity.antibiotic_function.level)) {
    normalized.toxicity.antibiotic_function.level = null;
  }
  if (!VALID_RISK_LEVELS.includes(normalized.psychosis.level)) {
    normalized.psychosis.level = null;
  }
  if (!VALID_RISK_LEVELS.includes(normalized.seizure.level)) {
    normalized.seizure.level = null;
  }

  return normalized;
}

export function parseGeneratedYaml(response) {
  const yamlMatch = response.match(/```ya?ml\s*([\s\S]*?)```/);
  const yamlContent = yamlMatch ? yamlMatch[1].trim() : response.trim();

  try {
    const parsed = yaml.parse(yamlContent);
    const harmPotential = parsed.harm_potential || parsed;
    if (
      harmPotential.addiction !== undefined ||
      harmPotential.toxicity !== undefined ||
      harmPotential.psychosis !== undefined ||
      harmPotential.seizure !== undefined
    ) {
      return normalizeHarmPotential(harmPotential);
    }
    throw new Error("Invalid harm_potential structure - missing expected fields (addiction, toxicity, psychosis, seizure)");
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error.message}`);
  }
}

export function selectArticlesForProcessing(allArticles, options) {
  let articles = allArticles.filter((article) => article.priority === "high" || article.priority === "normal");

  if (options.substance) {
    articles = articles.filter((article) => titleToSlug(article.title) === options.substance);
    if (articles.length === 0) {
      throw new Error(`No article found for slug "${options.substance}"`);
    }
    return { articles, notFound: [] };
  }

  let notFound = [];
  if (options.slugs?.length) {
    articles = articles.filter((article) => options.slugs.includes(titleToSlug(article.title)));
    if (articles.length === 0) {
      throw new Error(`No articles found for slugs: ${options.slugs.join(", ")}`);
    }
    notFound = options.slugs.filter((slug) => !articles.some((article) => titleToSlug(article.title) === slug));
  } else if (!options.all && !options.newOnly) {
    articles = articles.filter(hasExistingHarmPotential);
  }

  if (options.limit && articles.length > options.limit) {
    articles = articles.slice(0, options.limit);
  }

  return { articles, notFound };
}
