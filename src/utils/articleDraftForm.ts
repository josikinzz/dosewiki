import {
  ensureNormalizedTagList,
  joinNormalizedValues,
  tokenizeTagField,
  toTrimmedArray,
} from "./tagDelimiters";

export { ensureNormalizedTagList, joinNormalizedValues } from "./tagDelimiters";

/**
 * Shared helpers for building and hydrating article draft form state across Dev Tools tabs.
 * The ArticleDraftForm mirrors the substance article schema sourced from `src/data/articles.json`.
 */

export type DoseRangeForm = {
  threshold: string;
  light: string;
  common: string;
  strong: string;
  heavy: string;
};

export type RouteEntryForm = {
  route: string;
  units: string;
  doseRanges: DoseRangeForm;
};

export type CitationEntryForm = {
  name: string;
  reference: string;
};

export type DurationForm = {
  totalDuration: string;
  onset: string;
  peak: string;
  offset: string;
  afterEffects: string;
};

export type ToleranceForm = {
  fullTolerance: string;
  halfTolerance: string;
  zeroTolerance: string;
};

export type ArticleDraftForm = {
  id: string;
  title: string;
  indexCategory: string;
  drugName: string;
  chemicalName: string;
  alternativeName: string;
  chemicalClass: string;
  chemicalClasses: string[];
  psychoactiveClass: string;
  psychoactiveClasses: string[];
  mechanismOfAction: string;
  mechanismEntries: string[];
  addictionPotential: string;
  notes: string;
  halfLife: string;
  categoriesInput: string;
  categories: string[];
  subjectiveEffectsInput: string;
  crossTolerancesInput: string;
  interactionsDangerousInput: string;
  interactionsUnsafeInput: string;
  interactionsCautionInput: string;
  duration: DurationForm;
  tolerance: ToleranceForm;
  routes: RouteEntryForm[];
  citations: CitationEntryForm[];
};

export type ArticleDraftStringField =
  | "id"
  | "title"
  | "indexCategory"
  | "drugName"
  | "chemicalName"
  | "alternativeName"
  | "chemicalClass"
  | "psychoactiveClass"
  | "mechanismOfAction"
  | "addictionPotential"
  | "notes"
  | "halfLife"
  | "categoriesInput"
  | "subjectiveEffectsInput"
  | "crossTolerancesInput"
  | "interactionsDangerousInput"
  | "interactionsUnsafeInput"
  | "interactionsCautionInput";

export type ArticleDraftPayload = {
  id?: number;
  title: string;
  "index-category": string;
  drug_info: {
    drug_name: string;
    chemical_name: string;
    alternative_name: string;
    chemical_class: string;
    psychoactive_class: string;
    mechanism_of_action: string;
    addiction_potential: string;
    notes: string;
    half_life: string;
    categories: string[];
    subjective_effects: string[];
    tolerance: {
      full_tolerance: string;
      half_tolerance: string;
      zero_tolerance: string;
      cross_tolerances: string[];
    };
    duration: {
      total_duration: string;
      onset: string;
      peak: string;
      offset: string;
      after_effects: string;
    };
    dosages: {
      routes_of_administration: Array<{
        route: string;
        units: string;
        dose_ranges: {
          threshold: string;
          light: string;
          common: string;
          strong: string;
          heavy: string;
        };
      }>;
    };
    interactions: {
      dangerous: string[];
      unsafe: string[];
      caution: string[];
    };
    citations: Array<{
      name: string;
      reference: string;
    }>;
  };
};

export const createEmptyDoseRanges = (): DoseRangeForm => ({
  threshold: "",
  light: "",
  common: "",
  strong: "",
  heavy: "",
});

export const createEmptyRouteEntry = (): RouteEntryForm => ({
  route: "",
  units: "",
  doseRanges: createEmptyDoseRanges(),
});

export const createEmptyCitationEntry = (): CitationEntryForm => ({
  name: "",
  reference: "",
});

export const createEmptyArticleDraftForm = (): ArticleDraftForm => ({
  id: "",
  title: "",
  indexCategory: "",
  drugName: "",
  chemicalName: "",
  alternativeName: "",
  chemicalClass: "",
  chemicalClasses: [],
  psychoactiveClass: "",
  psychoactiveClasses: [],
  mechanismOfAction: "",
  mechanismEntries: [],
  addictionPotential: "",
  notes: "",
  halfLife: "",
  categoriesInput: "",
  categories: [],
  subjectiveEffectsInput: "",
  crossTolerancesInput: "",
  interactionsDangerousInput: "",
  interactionsUnsafeInput: "",
  interactionsCautionInput: "",
  duration: {
    totalDuration: "",
    onset: "",
    peak: "",
    offset: "",
    afterEffects: "",
  },
  tolerance: {
    fullTolerance: "",
    halfTolerance: "",
    zeroTolerance: "",
  },
  routes: [createEmptyRouteEntry()],
  citations: [createEmptyCitationEntry()],
});

export const parseListInput = (value: string): string[] =>
  value
    .split(/\r?\n+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const parseDelimitedField = (value: unknown): string[] =>
  tokenizeTagField(value, { splitOnComma: true, splitOnSlash: true });

const parseMechanismField = (value: unknown): string[] =>
  tokenizeTagField(value, { splitOnComma: false, splitOnSlash: true });

const joinListValues = (value: unknown): string => {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .join("\n");
};

const toTrimmedString = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return "";
};

const hydrateRouteEntry = (value: unknown): RouteEntryForm => {
  if (!value || typeof value !== "object") {
    return createEmptyRouteEntry();
  }

  const entry = value as {
    route?: unknown;
    units?: unknown;
    dose_ranges?: {
      threshold?: unknown;
      light?: unknown;
      common?: unknown;
      strong?: unknown;
      heavy?: unknown;
    };
  };

  const ranges = entry.dose_ranges ?? {};

  return {
    route: toTrimmedString(entry.route),
    units: toTrimmedString(entry.units),
    doseRanges: {
      threshold: toTrimmedString(ranges.threshold),
      light: toTrimmedString(ranges.light),
      common: toTrimmedString(ranges.common),
      strong: toTrimmedString(ranges.strong),
      heavy: toTrimmedString(ranges.heavy),
    },
  };
};

const hydrateCitationEntry = (value: unknown): CitationEntryForm => {
  if (!value || typeof value !== "object") {
    return createEmptyCitationEntry();
  }

  const entry = value as { name?: unknown; reference?: unknown };
  return {
    name: toTrimmedString(entry.name),
    reference: toTrimmedString(entry.reference),
  };
};

export const hydrateArticleDraftForm = (record: unknown): ArticleDraftForm => {
  const base = createEmptyArticleDraftForm();
  if (!record || typeof record !== "object") {
    return base;
  }

  const article = record as {
    id?: unknown;
    title?: unknown;
    ["index-category"]?: unknown;
    drug_info?: {
      drug_name?: unknown;
      chemical_name?: unknown;
      alternative_name?: unknown;
      chemical_class?: unknown;
      psychoactive_class?: unknown;
      mechanism_of_action?: unknown;
      addiction_potential?: unknown;
      notes?: unknown;
      half_life?: unknown;
      categories?: unknown;
      subjective_effects?: unknown;
      tolerance?: {
        full_tolerance?: unknown;
        half_tolerance?: unknown;
        zero_tolerance?: unknown;
        cross_tolerances?: unknown;
      };
      duration?: {
        total_duration?: unknown;
        onset?: unknown;
        peak?: unknown;
        offset?: unknown;
        after_effects?: unknown;
      };
      dosages?: {
        routes_of_administration?: unknown;
      };
      interactions?: {
        dangerous?: unknown;
        unsafe?: unknown;
        caution?: unknown;
      };
      citations?: unknown;
    };
  };

  const drugInfo = article.drug_info ?? {};
  const tolerance = drugInfo.tolerance ?? {};
  const duration = drugInfo.duration ?? {};
  const interactions = drugInfo.interactions ?? {};
  const rawRoutes = Array.isArray(drugInfo.dosages?.routes_of_administration)
    ? (drugInfo.dosages?.routes_of_administration as unknown[])
    : [];
  const rawCitations = Array.isArray(drugInfo.citations) ? (drugInfo.citations as unknown[]) : [];

  const categories = ensureNormalizedTagList(toTrimmedArray(drugInfo.categories));
  const chemicalClasses = parseDelimitedField(drugInfo.chemical_class);
  const psychoactiveClasses = parseDelimitedField(drugInfo.psychoactive_class);
  const mechanismEntries = parseMechanismField(drugInfo.mechanism_of_action);

  const chemicalClassString =
    chemicalClasses.length > 0
      ? joinNormalizedValues(chemicalClasses, "; ")
      : toTrimmedString(drugInfo.chemical_class);

  const psychoactiveClassString =
    psychoactiveClasses.length > 0
      ? joinNormalizedValues(psychoactiveClasses, "; ")
      : toTrimmedString(drugInfo.psychoactive_class);

  const mechanismString =
    mechanismEntries.length > 0
      ? joinNormalizedValues(mechanismEntries, "; ")
      : toTrimmedString(drugInfo.mechanism_of_action);

  const categoriesInputValue =
    categories.length > 0 ? categories.join("\n") : joinListValues(drugInfo.categories);

  const hydratedRoutes = rawRoutes.map(hydrateRouteEntry).filter((entry) => {
    return entry.route.length > 0 || entry.units.length > 0 || Object.values(entry.doseRanges).some((value) => value.length > 0);
  });

  const hydratedCitations = rawCitations.map(hydrateCitationEntry).filter((entry) => entry.name.length > 0 || entry.reference.length > 0);

  return {
    ...base,
    id: toTrimmedString(article.id),
    title: toTrimmedString(article.title),
    indexCategory: toTrimmedString(article["index-category"]),
    drugName: toTrimmedString(drugInfo.drug_name),
    chemicalName: toTrimmedString(drugInfo.chemical_name),
    alternativeName: toTrimmedString(drugInfo.alternative_name),
    chemicalClass: chemicalClassString,
    chemicalClasses,
    psychoactiveClass: psychoactiveClassString,
    psychoactiveClasses,
    mechanismOfAction: mechanismString,
    mechanismEntries,
    addictionPotential: toTrimmedString(drugInfo.addiction_potential),
    notes: toTrimmedString(drugInfo.notes),
    halfLife: toTrimmedString(drugInfo.half_life),
    categoriesInput: categoriesInputValue,
    categories,
    subjectiveEffectsInput: joinListValues(drugInfo.subjective_effects),
    crossTolerancesInput: joinListValues(tolerance.cross_tolerances),
    interactionsDangerousInput: joinListValues(interactions.dangerous),
    interactionsUnsafeInput: joinListValues(interactions.unsafe),
    interactionsCautionInput: joinListValues(interactions.caution),
    duration: {
      totalDuration: toTrimmedString(duration.total_duration),
      onset: toTrimmedString(duration.onset),
      peak: toTrimmedString(duration.peak),
      offset: toTrimmedString(duration.offset),
      afterEffects: toTrimmedString(duration.after_effects),
    },
    tolerance: {
      fullTolerance: toTrimmedString(tolerance.full_tolerance),
      halfTolerance: toTrimmedString(tolerance.half_tolerance),
      zeroTolerance: toTrimmedString(tolerance.zero_tolerance),
    },
    routes: hydratedRoutes.length > 0 ? hydratedRoutes : base.routes,
    citations: hydratedCitations.length > 0 ? hydratedCitations : base.citations,
  };
};

export const buildArticleFromDraft = (form: ArticleDraftForm): ArticleDraftPayload => {
  const idValue = Number.parseInt(form.id.trim(), 10);
  const hasValidId = Number.isFinite(idValue);

  const routes = form.routes
    .map((route) => {
      const trimmedDoseRanges = {
        threshold: route.doseRanges.threshold.trim(),
        light: route.doseRanges.light.trim(),
        common: route.doseRanges.common.trim(),
        strong: route.doseRanges.strong.trim(),
        heavy: route.doseRanges.heavy.trim(),
      };

      const hasDoseContent = Object.values(trimmedDoseRanges).some((value) => value.length > 0);

      return {
        route: route.route.trim(),
        units: route.units.trim(),
        dose_ranges: trimmedDoseRanges,
        hasDoseContent,
      };
    })
    .filter((route) => route.route.length > 0 || route.units.length > 0 || route.hasDoseContent)
    .map(({ hasDoseContent: _omit, ...rest }) => rest);

  const citations = form.citations
    .map((entry) => ({ name: entry.name.trim(), reference: entry.reference.trim() }))
    .filter((entry) => entry.name.length > 0 || entry.reference.length > 0);

  const interactions = {
    dangerous: parseListInput(form.interactionsDangerousInput),
    unsafe: parseListInput(form.interactionsUnsafeInput),
    caution: parseListInput(form.interactionsCautionInput),
  };

  const duration = {
    total_duration: form.duration.totalDuration.trim(),
    onset: form.duration.onset.trim(),
    peak: form.duration.peak.trim(),
    offset: form.duration.offset.trim(),
    after_effects: form.duration.afterEffects.trim(),
  };

  const tolerance = {
    full_tolerance: form.tolerance.fullTolerance.trim(),
    half_tolerance: form.tolerance.halfTolerance.trim(),
    zero_tolerance: form.tolerance.zeroTolerance.trim(),
    cross_tolerances: parseListInput(form.crossTolerancesInput),
  };

  const normalizedCategories =
    form.categories.length > 0
      ? ensureNormalizedTagList(form.categories)
      : parseListInput(form.categoriesInput);

  const normalizedChemicalClasses =
    form.chemicalClasses.length > 0
      ? ensureNormalizedTagList(form.chemicalClasses)
      : parseDelimitedField(form.chemicalClass);

  const normalizedPsychoactiveClasses =
    form.psychoactiveClasses.length > 0
      ? ensureNormalizedTagList(form.psychoactiveClasses)
      : parseDelimitedField(form.psychoactiveClass);

  const normalizedMechanismEntries =
    form.mechanismEntries.length > 0
      ? ensureNormalizedTagList(form.mechanismEntries)
      : parseMechanismField(form.mechanismOfAction);

  const chemicalClassValue =
    normalizedChemicalClasses.length > 0
      ? joinNormalizedValues(normalizedChemicalClasses, "; ")
      : form.chemicalClass.trim();

  const psychoactiveClassValue =
    normalizedPsychoactiveClasses.length > 0
      ? joinNormalizedValues(normalizedPsychoactiveClasses, "; ")
      : form.psychoactiveClass.trim();

  const mechanismValue =
    normalizedMechanismEntries.length > 0
      ? joinNormalizedValues(normalizedMechanismEntries, "; ")
      : form.mechanismOfAction.trim();

  const drugInfo = {
    drug_name: form.drugName.trim(),
    chemical_name: form.chemicalName.trim(),
    alternative_name: form.alternativeName.trim(),
    chemical_class: chemicalClassValue,
    psychoactive_class: psychoactiveClassValue,
    mechanism_of_action: mechanismValue,
    dosages: {
      routes_of_administration: routes,
    },
    duration,
    addiction_potential: form.addictionPotential.trim(),
    interactions,
    notes: form.notes.trim(),
    subjective_effects: parseListInput(form.subjectiveEffectsInput),
    tolerance,
    half_life: form.halfLife.trim(),
    citations,
    categories: normalizedCategories,
  };

  const payload: ArticleDraftPayload = {
    title: form.title.trim(),
    "index-category": form.indexCategory.trim(),
    drug_info: drugInfo,
  };

  if (hasValidId) {
    payload.id = idValue;
  }

  return payload;
};
