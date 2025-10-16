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

export type DurationStagePayload = {
  total_duration?: string;
  onset?: string;
  peak?: string;
  offset?: string;
  after_effects?: string;
};

const DURATION_STAGE_KEYS: Array<keyof DurationStagePayload> = [
  "total_duration",
  "onset",
  "peak",
  "offset",
  "after_effects",
];

export type DurationRoutePayload = {
  route: string;
  canonical_routes?: string[];
  stages: DurationStagePayload;
};

export type StructuredDurationPayload = {
  general?: DurationStagePayload;
  routes_of_administration?: DurationRoutePayload[];
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
  indexCategoryTags: string[];
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
  durationRoutes: DurationRoutePayload[];
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
    duration: DurationStagePayload | StructuredDurationPayload;
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
  indexCategoryTags: [],
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
  durationRoutes: [createEmptyDurationRouteEntry()],
  tolerance: {
    fullTolerance: "",
    halfTolerance: "",
    zeroTolerance: "",
  },
  routes: [createEmptyRouteEntry()],
  citations: [createEmptyCitationEntry()],
});

export const createEmptyDurationRouteEntry = (route: string = ""): DurationRoutePayload => ({
  route,
  stages: createEmptyDurationStagePayload(),
});

const createEmptyDurationStagePayload = (): DurationStagePayload => ({
  total_duration: "",
  onset: "",
  peak: "",
  offset: "",
  after_effects: "",
});

const sanitizeDurationStagePayload = (value: unknown): DurationStagePayload => {
  if (!value || typeof value !== "object") {
    return createEmptyDurationStagePayload();
  }

  const record = value as Record<string, unknown>;
  return {
    total_duration: toTrimmedString(record.total_duration),
    onset: toTrimmedString(record.onset),
    peak: toTrimmedString(record.peak),
    offset: toTrimmedString(record.offset),
    after_effects: toTrimmedString(record.after_effects),
  };
};

const hasDurationStageContent = (payload: DurationStagePayload): boolean =>
  Object.values(payload).some((entry) => typeof entry === "string" && entry.length > 0);

const sanitizeDurationRoutes = (value: unknown): DurationRoutePayload[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as {
        route?: unknown;
        canonical_routes?: unknown;
        stages?: unknown;
      };

      const routeLabel = toTrimmedString(record.route);
      const canonicalRoutes = Array.isArray(record.canonical_routes)
        ? record.canonical_routes
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item) => item.length > 0)
        : undefined;
      const stages = sanitizeDurationStagePayload(record.stages);

      if (!routeLabel && !hasDurationStageContent(stages)) {
        return null;
      }

      const payload: DurationRoutePayload = {
        route: routeLabel,
        stages,
      };

      if (canonicalRoutes && canonicalRoutes.length > 0) {
        payload.canonical_routes = canonicalRoutes;
      }

      return payload;
    })
    .filter((entry): entry is DurationRoutePayload => entry !== null);
};

const alignDurationRoutesWithRoutes = (
  durationRoutes: DurationRoutePayload[],
  routes: RouteEntryForm[],
): DurationRoutePayload[] => {
  if (routes.length === 0) {
    return durationRoutes.length > 0 ? durationRoutes : [createEmptyDurationRouteEntry()];
  }

  return routes.map((route, index) => {
    const existing = durationRoutes[index] ?? createEmptyDurationRouteEntry();
    return {
      ...existing,
      route: route.route,
      stages: sanitizeDurationStagePayload(existing.stages),
    };
  });
};

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
  const rawDuration = drugInfo.duration;
  const structuredDuration =
    rawDuration &&
    typeof rawDuration === "object" &&
    !Array.isArray(rawDuration) &&
    (Object.prototype.hasOwnProperty.call(rawDuration, "general") ||
      Object.prototype.hasOwnProperty.call(rawDuration, "routes_of_administration"))
      ? (rawDuration as StructuredDurationPayload)
      : undefined;
  const durationRoutes = structuredDuration
    ? sanitizeDurationRoutes(structuredDuration.routes_of_administration)
    : [];
  const generalDurationPayload = structuredDuration
    ? sanitizeDurationStagePayload(structuredDuration.general)
    : sanitizeDurationStagePayload(rawDuration);
  const fallbackDurationPayload =
    hasDurationStageContent(generalDurationPayload) || durationRoutes.length === 0
      ? generalDurationPayload
      : durationRoutes[0]!.stages;
  const interactions = drugInfo.interactions ?? {};
  const rawRoutes = Array.isArray(drugInfo.dosages?.routes_of_administration)
    ? (drugInfo.dosages?.routes_of_administration as unknown[])
    : [];
  const rawCitations = Array.isArray(drugInfo.citations) ? (drugInfo.citations as unknown[]) : [];

  const categories = ensureNormalizedTagList(toTrimmedArray(drugInfo.categories));
  const chemicalClasses = parseDelimitedField(drugInfo.chemical_class);
  const psychoactiveClasses = parseDelimitedField(drugInfo.psychoactive_class);
  const mechanismEntries = parseMechanismField(drugInfo.mechanism_of_action);

  const rawIndexCategory = toTrimmedString(article["index-category"]);
  const indexCategoryTags = rawIndexCategory
    ? tokenizeTagField(rawIndexCategory, { splitOnComma: false, splitOnSlash: true })
    : [];
  const indexCategoryValue =
    indexCategoryTags.length > 0 ? joinNormalizedValues(indexCategoryTags, "; ") : rawIndexCategory;

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

  const routesForForm = hydratedRoutes.length > 0 ? hydratedRoutes : base.routes;
  const alignedDurationRoutes = alignDurationRoutesWithRoutes(durationRoutes, routesForForm);

  return {
    ...base,
    id: toTrimmedString(article.id),
    title: toTrimmedString(article.title),
    indexCategory: indexCategoryValue,
    indexCategoryTags,
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
      totalDuration: fallbackDurationPayload.total_duration,
      onset: fallbackDurationPayload.onset,
      peak: fallbackDurationPayload.peak,
      offset: fallbackDurationPayload.offset,
      afterEffects: fallbackDurationPayload.after_effects,
    },
    durationRoutes: alignedDurationRoutes,
    tolerance: {
      fullTolerance: toTrimmedString(tolerance.full_tolerance),
      halfTolerance: toTrimmedString(tolerance.half_tolerance),
      zeroTolerance: toTrimmedString(tolerance.zero_tolerance),
    },
    routes: routesForForm,
    citations: hydratedCitations.length > 0 ? hydratedCitations : base.citations,
  };
};

export const buildArticleFromDraft = (form: ArticleDraftForm): ArticleDraftPayload => {
  const idValue = Number.parseInt(form.id.trim(), 10);
  const hasValidId = Number.isFinite(idValue);

  const citations = form.citations
    .map((entry) => ({ name: entry.name.trim(), reference: entry.reference.trim() }))
    .filter((entry) => entry.name.length > 0 || entry.reference.length > 0);

  const interactions = {
    dangerous: parseListInput(form.interactionsDangerousInput),
    unsafe: parseListInput(form.interactionsUnsafeInput),
    caution: parseListInput(form.interactionsCautionInput),
  };

  const generalDuration: DurationStagePayload = {
    total_duration: form.duration.totalDuration.trim(),
    onset: form.duration.onset.trim(),
    peak: form.duration.peak.trim(),
    offset: form.duration.offset.trim(),
    after_effects: form.duration.afterEffects.trim(),
  };

  const alignedDurationRoutes = alignDurationRoutesWithRoutes(form.durationRoutes, form.routes);

  const durationRoutesPayload: DurationRoutePayload[] = [];
  const dosageRoutes: Array<{
    route: string;
    units: string;
    dose_ranges: {
      threshold: string;
      light: string;
      common: string;
      strong: string;
      heavy: string;
    };
  }> = [];

  form.routes.forEach((route, index) => {
    const trimmedDoseRanges = {
      threshold: route.doseRanges.threshold.trim(),
      light: route.doseRanges.light.trim(),
      common: route.doseRanges.common.trim(),
      strong: route.doseRanges.strong.trim(),
      heavy: route.doseRanges.heavy.trim(),
    };

    const hasDoseContent = Object.values(trimmedDoseRanges).some((value) => value.length > 0);
    const trimmedRouteLabel = route.route.trim();
    const trimmedUnits = route.units.trim();

    if (!trimmedRouteLabel && !trimmedUnits && !hasDoseContent) {
      return;
    }

    dosageRoutes.push({
      route: trimmedRouteLabel,
      units: trimmedUnits,
      dose_ranges: trimmedDoseRanges,
    });

    const durationSource = alignedDurationRoutes[index] ?? createEmptyDurationRouteEntry();
    const canonicalRoutes = Array.isArray(durationSource.canonical_routes)
      ? durationSource.canonical_routes.map((item) => item.trim()).filter((item) => item.length > 0)
      : undefined;
    const sanitizedStages = sanitizeDurationStagePayload(durationSource.stages);

    const mergedStages: DurationStagePayload = {};
    for (const stageKey of DURATION_STAGE_KEYS) {
      const specificValue = typeof sanitizedStages[stageKey] === "string" ? sanitizedStages[stageKey]!.trim() : "";
      const fallbackValue = typeof generalDuration[stageKey] === "string" ? generalDuration[stageKey]!.trim() : "";
      const selected = specificValue.length > 0 ? specificValue : fallbackValue;
      if (selected.length > 0) {
        mergedStages[stageKey] = selected;
      }
    }

    if (trimmedRouteLabel.length > 0 && hasDurationStageContent(mergedStages)) {
      const payload: DurationRoutePayload = {
        route: trimmedRouteLabel,
        stages: mergedStages,
      };

      if (canonicalRoutes && canonicalRoutes.length > 0) {
        payload.canonical_routes = canonicalRoutes;
      }

      durationRoutesPayload.push(payload);
    }
  });

  const duration: StructuredDurationPayload = {};

  if (durationRoutesPayload.length > 0) {
    duration.routes_of_administration = durationRoutesPayload;
  } else if (hasDurationStageContent(generalDuration)) {
    const generalOutput: DurationStagePayload = {};
    for (const stageKey of DURATION_STAGE_KEYS) {
      const value = typeof generalDuration[stageKey] === "string" ? generalDuration[stageKey]!.trim() : "";
      if (value.length > 0) {
        generalOutput[stageKey] = value;
      }
    }
    duration.general = generalOutput;
  }

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

  const normalizedIndexCategoryTags =
    form.indexCategoryTags.length > 0
      ? ensureNormalizedTagList(form.indexCategoryTags)
      : tokenizeTagField(form.indexCategory, { splitOnComma: false, splitOnSlash: true });

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
      routes_of_administration: dosageRoutes,
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

  const indexCategoryValue =
    normalizedIndexCategoryTags.length > 0
      ? joinNormalizedValues(normalizedIndexCategoryTags, "; ")
      : form.indexCategory.trim();

  const payload: ArticleDraftPayload = {
    title: form.title.trim(),
    "index-category": indexCategoryValue,
    drug_info: drugInfo,
  };

  if (hasValidId) {
    payload.id = idValue;
  }

  return payload;
};
