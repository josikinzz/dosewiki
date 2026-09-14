import {
  CITATION_ORDER,
  CLASSIFICATION_ORDER,
  COUNTRY_LEGALITY_ORDER,
  DRUG_COMPARISON_ORDER,
  HARM_POTENTIAL_ORDER,
  HISTORY_CULTURE_DATE_RANGE_ORDER,
  HISTORY_CULTURE_ORDER,
  HISTORY_CULTURE_SECTION_ORDER,
  HISTORY_CULTURE_SUBSECTION_ORDER,
  IDENTIFICATION_ORDER,
  INTERACTIONS_ORDER,
  LEGALITY_ORDER,
  PHARMACOLOGY_ORDER,
  RISKS_ORDER,
  TOLERANCE_ORDER,
  TOXICITY_ORDER,
  TOP_LEVEL_ORDER,
} from './orders.mjs';
import { orderObject } from './core.mjs';
import { reorderDosage } from './dosage.mjs';
import { reorderDuration } from './duration.mjs';
import { reorderSubjectiveEffects } from './effects.mjs';

function reorderPharmacology(pharmacology, options) { if (!pharmacology) return pharmacology;
return orderObject(pharmacology, PHARMACOLOGY_ORDER, { ...options, context: 'pharmacology' }); }

export function reorderInteractions(interactions, options) {
  if (!interactions) return interactions;
  return orderObject(interactions, INTERACTIONS_ORDER, { ...options, context: 'interactions' });
}

export function reorderTolerance(tolerance, options) {
  if (!tolerance) return tolerance;
  return orderObject(tolerance, TOLERANCE_ORDER, { ...options, context: 'tolerance' });
}

function reorderToxicity(toxicity, options) { if (!toxicity) return toxicity;
return orderObject(toxicity, TOXICITY_ORDER, { ...options, context: 'toxicity' }); }

function reorderRisks(risks, options) { if (!risks) return risks;
return orderObject(risks, RISKS_ORDER, { ...options, context: 'risks' }); }

function reorderHarmPotential(harmPotential, options) { if (!harmPotential) return harmPotential;
const result = { ...harmPotential };
if (result.toxicity) {
  result.toxicity = reorderToxicity(result.toxicity, options);
}
if (result.risks) {
  result.risks = reorderRisks(result.risks, options);
}
return orderObject(result, HARM_POTENTIAL_ORDER, { ...options, context: 'harm_potential' }); }

function reorderHistoryCultureDateRange(dateRange, options) { if (!dateRange) return dateRange;
return orderObject(dateRange, HISTORY_CULTURE_DATE_RANGE_ORDER, { ...options, context: 'date_range' }); }

function reorderHistoryCultureSubsection(subsection, options) { if (!subsection) return subsection;
const result = { ...subsection };
if (result.date_range) {
  result.date_range = reorderHistoryCultureDateRange(result.date_range, options);
}
return orderObject(result, HISTORY_CULTURE_SUBSECTION_ORDER, {
  ...options,
  context: 'history_culture_subsection',
}); }

function reorderHistoryCultureSection(section, options) { if (!section) return section;
const result = { ...section };
if (result.date_range) {
  result.date_range = reorderHistoryCultureDateRange(result.date_range, options);
}
if (Array.isArray(result.subsections)) {
  result.subsections = result.subsections.map((entry) => reorderHistoryCultureSubsection(entry, options));
}
return orderObject(result, HISTORY_CULTURE_SECTION_ORDER, {
  ...options,
  context: 'history_culture_section',
}); }

function reorderHistoryCulture(historyCulture, options) { if (!historyCulture) return historyCulture;
const result = { ...historyCulture };
if (Array.isArray(result.sections)) {
  result.sections = result.sections.map((entry) => reorderHistoryCultureSection(entry, options));
}
return orderObject(result, HISTORY_CULTURE_ORDER, { ...options, context: 'history_culture' }); }

function reorderCountryLegality(countryLegality, options) { if (!countryLegality) return countryLegality;
return orderObject(countryLegality, COUNTRY_LEGALITY_ORDER, { ...options, context: 'country_legality' }); }

function reorderLegality(legality, options) { if (!legality) return legality;
const result = { ...legality };
if (result.countries && typeof result.countries === 'object') {
  const countries = {};
  for (const country of Object.keys(result.countries)) {
    countries[country] = reorderCountryLegality(result.countries[country], options);
  }
  result.countries = countries;
}
return orderObject(result, LEGALITY_ORDER, { ...options, context: 'legality' }); }

function reorderCitation(citation, options) { if (!citation) return citation;
return orderObject(citation, CITATION_ORDER, { ...options, context: 'citation' }); }

function reorderComparison(comparison, options) { if (!comparison) return comparison;
return orderObject(comparison, DRUG_COMPARISON_ORDER, { ...options, context: 'comparison' }); }

export function reorderArticle(article, index, options = {}) {
  if (!article || typeof article !== 'object') return article;

  const result = { ...article };
  const context = article.title || `article[${index}]`;
  const scopedOptions = { ...options, context };

  if (result.identification) {
    result.identification = orderObject(result.identification, IDENTIFICATION_ORDER, {
      ...scopedOptions,
      context: `${context}.identification`,
    });
  }
  if (result.classification) {
    result.classification = orderObject(result.classification, CLASSIFICATION_ORDER, {
      ...scopedOptions,
      context: `${context}.classification`,
    });
  }
  if (result.dosage) {
    result.dosage = reorderDosage(result.dosage, scopedOptions);
  }
  if (result.duration) {
    result.duration = reorderDuration(result.duration, scopedOptions);
  }
  if (result.subjective_effects) {
    result.subjective_effects = reorderSubjectiveEffects(result.subjective_effects, scopedOptions);
  }
  if (Array.isArray(result.comparisons)) {
    result.comparisons = result.comparisons.map((entry) => reorderComparison(entry, scopedOptions));
  }
  if (result.pharmacology) {
    result.pharmacology = reorderPharmacology(result.pharmacology, scopedOptions);
  }
  if (result.interactions) {
    result.interactions = reorderInteractions(result.interactions, scopedOptions);
  }
  if (result.tolerance) {
    result.tolerance = reorderTolerance(result.tolerance, scopedOptions);
  }
  if (result.harm_potential) {
    result.harm_potential = reorderHarmPotential(result.harm_potential, scopedOptions);
  }
  if (result.history_culture) {
    result.history_culture = reorderHistoryCulture(result.history_culture, scopedOptions);
  }
  if (result.legality) {
    result.legality = reorderLegality(result.legality, scopedOptions);
  }
  if (Array.isArray(result.source_citations)) {
    result.source_citations = result.source_citations.map((entry) => reorderCitation(entry, scopedOptions));
  }
  if (Array.isArray(result.citations)) {
    result.citations = result.citations.map((entry) => reorderCitation(entry, scopedOptions));
  }

  return orderObject(result, TOP_LEVEL_ORDER, scopedOptions);
}

export function reorderArticles(articles, options = {}) {
  return articles.map((article, index) => {
    if (options.verbose) {
      options.logger?.log(`\nProcessing: ${article?.title || `article[${index}]`}`);
    }
    return reorderArticle(article, index, options);
  });
}
