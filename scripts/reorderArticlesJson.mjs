import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const articlesPath = path.resolve(__dirname, '../src/data/articles.json');

const topLevelOrder = ['id', 'title', 'drug_info', 'index-category'];
const drugInfoOrder = [
  'drug_name',
  'substitutive_name',
  'IUPAC_name',
  'botanical_name',
  'alternative_name',
  'chemical_class',
  'psychoactive_class',
  'mechanism_of_action',
  'categories',
  'dosages',
  'duration',
  'tolerance',
  'half_life',
  'addiction_potential',
  'interactions',
  'notes',
  'subjective_effects',
  'citations'
];
const dosageRouteOrder = ['route', 'units', 'dose_ranges'];
const doseRangeOrder = ['threshold', 'light', 'moderate', 'strong', 'heavy'];
const durationRouteOrder = ['route', 'canonical_routes', 'stages'];
const durationStageOrder = [
  'total_duration',
  'onset',
  'come_up',
  'peak',
  'offset',
  'after_effects'
];
const toleranceOrder = [
  'full_tolerance',
  'half_tolerance',
  'zero_tolerance',
  'cross_tolerances'
];
const interactionsOrder = ['dangerous', 'unsafe', 'caution'];
const citationOrder = ['name', 'reference'];

const orderObject = (source, order) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  const ordered = {};
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      ordered[key] = source[key];
    }
  }
  for (const key of Object.keys(source)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
      ordered[key] = source[key];
    }
  }
  return ordered;
};

const reorderDoseRanges = (ranges) => {
  if (!ranges) return ranges;
  return orderObject(ranges, doseRangeOrder);
};

const reorderDosageRoutes = (routes) => {
  if (!Array.isArray(routes)) return routes;
  return routes.map((route) => {
    const next = { ...route };
    if (next.dose_ranges) {
      next.dose_ranges = reorderDoseRanges(next.dose_ranges);
    }
    return orderObject(next, dosageRouteOrder);
  });
};

const reorderDurationRoutes = (routes) => {
  if (!Array.isArray(routes)) return routes;
  return routes.map((route) => {
    const next = { ...route };
    if (next.stages) {
      next.stages = orderObject(next.stages, durationStageOrder);
    }
    return orderObject(next, durationRouteOrder);
  });
};

const reorderTolerance = (tolerance) => orderObject(tolerance, toleranceOrder);
const reorderInteractions = (interactions) => orderObject(interactions, interactionsOrder);

const reorderCitations = (citations) => {
  if (!Array.isArray(citations)) return citations;
  return citations.map((entry) => orderObject(entry, citationOrder));
};

const reorderDrugInfo = (info) => {
  if (!info) return info;
  const result = { ...info };
  if (result.dosages?.routes_of_administration) {
    result.dosages = {
      ...result.dosages,
      routes_of_administration: reorderDosageRoutes(result.dosages.routes_of_administration)
    };
  }
  if (result.duration?.routes_of_administration) {
    result.duration = {
      ...result.duration,
      routes_of_administration: reorderDurationRoutes(result.duration.routes_of_administration)
    };
  }
  if (result.tolerance) {
    result.tolerance = reorderTolerance(result.tolerance);
  }
  if (result.interactions) {
    result.interactions = reorderInteractions(result.interactions);
  }
  if (result.citations) {
    result.citations = reorderCitations(result.citations);
  }
  return orderObject(result, drugInfoOrder);
};

const reorderArticle = (article) => {
  const next = { ...article };
  if (next.drug_info) {
    next.drug_info = reorderDrugInfo(next.drug_info);
  }
  return orderObject(next, topLevelOrder);
};

const main = () => {
  const raw = fs.readFileSync(articlesPath, 'utf8');
  const articles = JSON.parse(raw);
  const ordered = articles.map(reorderArticle);
  const output = JSON.stringify(ordered, null, 2) + '\n';
  fs.writeFileSync(articlesPath, output);
};

main();
