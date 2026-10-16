import { useCallback, useEffect, useRef } from "react";
import { useForm, useFieldArray, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { substanceArticleSchema, type SubstanceArticle } from "../schema";
import { createEmptyArticle, createEmptyDosageRoute, createEmptyDurationRoute } from "../data/schema";

type DosageRouteValue = SubstanceArticle["dosage"]["routes"][number];
type DurationRouteValue = SubstanceArticle["duration"]["routes"][number];

const normalizeRouteName = (route: string | undefined) =>
  String(route ?? "").trim().toLowerCase();

function routesAreAligned(
  dosage: DosageRouteValue[],
  duration: DurationRouteValue[],
): boolean {
  if (dosage.length !== duration.length) return false;
  return dosage.every((route, index) => route.route === duration[index]?.route);
}

export function pairRoutesByName(
  dosageRoutes: DosageRouteValue[],
  durationRoutes: DurationRouteValue[],
): { dosage: DosageRouteValue[]; duration: DurationRouteValue[] } {
  const claimed = new Set<number>();
  const dosage: DosageRouteValue[] = [];
  const duration: DurationRouteValue[] = [];

  for (const dosageRoute of dosageRoutes) {
    const wanted = normalizeRouteName(dosageRoute.route);
    const matchIndex = durationRoutes.findIndex(
      (durationRoute, index) =>
        !claimed.has(index) && normalizeRouteName(durationRoute.route) === wanted,
    );

    dosage.push(dosageRoute);
    if (matchIndex >= 0) {
      claimed.add(matchIndex);
      duration.push({ ...durationRoutes[matchIndex], route: dosageRoute.route });
    } else {
      duration.push(
        createEmptyDurationRoute(dosageRoute.route, {
          reference_ids: dosageRoute.reference_ids ?? [],
        }),
      );
    }
  }

  durationRoutes.forEach((durationRoute, index) => {
    if (claimed.has(index)) return;
    dosage.push(
      createEmptyDosageRoute(durationRoute.route, {
        reference_ids: durationRoute.reference_ids ?? [],
      }),
    );
    duration.push(durationRoute);
  });

  return { dosage, duration };
}

const createEmptyCitation = () => ({
  name: "",
  url: "",
});

const createEmptyReference = () => ({
  id: "",
  type: "unknown" as const,
  title: "",
  authors: [],
  year: null,
  date: null,
  containerTitle: null,
  siteName: null,
  publisher: null,
  volume: null,
  issue: null,
  pages: null,
  articleNumber: null,
  doi: null,
  pmid: null,
  isbn: null,
  url: null,
  accessedAt: null,
  sourceType: "unknown" as const,
  quality: "fallback" as const,
  apaText: null,
});

const createEmptyHistoryCultureSection = () => ({
  heading: "",
  content: "",
  subsections: [],
});

const stripUnderscoreKeys = (article: SubstanceArticle): SubstanceArticle =>
  Object.fromEntries(
    Object.entries(article).filter(([key]) => !key.startsWith("_")),
  ) as SubstanceArticle;

export type ArticleFormMethods = UseFormReturn<SubstanceArticle>;

export type UseArticleFormOptions = {
  article?: SubstanceArticle;
  onMutate?: () => void;
  preserveStructure?: boolean;
};

export type UseArticleFormReturn = {
  methods: ArticleFormMethods;
  dosageRoutes: ReturnType<typeof useFieldArray<SubstanceArticle, "dosage.routes">>;
  durationRoutes: ReturnType<typeof useFieldArray<SubstanceArticle, "duration.routes">>;
  references: ReturnType<typeof useFieldArray<SubstanceArticle, "references">>;
  sourceCitations: ReturnType<typeof useFieldArray<SubstanceArticle, "source_citations">>;
  citations: ReturnType<typeof useFieldArray<SubstanceArticle, "citations">>;
  comparisons: ReturnType<typeof useFieldArray<SubstanceArticle, "comparisons">>;
  historyCultureSections: ReturnType<typeof useFieldArray<SubstanceArticle, "history_culture.sections">>;
  addDosageRoute: () => void;
  removeDosageRoute: (index: number) => void;
  moveDosageRoute: (from: number, to: number) => void;
  renameDosageRoute: (index: number, name: string) => void;
  addSourceCitation: () => void;
  removeSourceCitation: (index: number) => void;
  addReference: () => void;
  removeReference: (index: number) => void;
  addCitation: () => void;
  removeCitation: (index: number) => void;
  addHistoryCultureSection: () => void;
  removeHistoryCultureSection: (index: number) => void;
  applyDurationFromRoute: (fromIndex: number, toIndex: number) => void;
  resetForm: (article?: SubstanceArticle) => void;
};

export function useArticleForm({
  article,
  onMutate,
  preserveStructure = false,
}: UseArticleFormOptions = {}): UseArticleFormReturn {
  const onMutateRef = useRef(onMutate);
  onMutateRef.current = onMutate;

  const suppressMutateRef = useRef(false);
  const suppressClearSkipRef = useRef(0);
  const suppressionGeneration = useRef(0);
  const runWithoutMutate = useCallback((operation: () => void) => {
    const generation = ++suppressionGeneration.current;
    suppressMutateRef.current = true;
    suppressClearSkipRef.current = 1;
    operation();
    queueMicrotask(() => {
      if (suppressionGeneration.current !== generation) return;
      suppressMutateRef.current = false;
      suppressClearSkipRef.current = 0;
    });
  }, []);

  const getDefaultValues = useCallback((source?: SubstanceArticle): SubstanceArticle => {
    const base = source ? stripUnderscoreKeys(source) : createEmptyArticle();
    if (preserveStructure) return base;
    const empty = createEmptyArticle();
    const paired = routesAreAligned(base.dosage.routes, base.duration.routes)
      ? { dosage: base.dosage.routes, duration: base.duration.routes }
      : pairRoutesByName(base.dosage.routes, base.duration.routes);
    return {
      ...base,
      dosage: { ...base.dosage, routes: paired.dosage },
      duration: { ...base.duration, routes: paired.duration },
      history_culture: base.history_culture ?? empty.history_culture,
      editorial_review: base.editorial_review ?? empty.editorial_review,
      references: Array.isArray(base.references) ? base.references : empty.references,
      source_citations: Array.isArray(base.source_citations) ? base.source_citations : empty.source_citations,
      citations: Array.isArray(base.citations) ? base.citations : empty.citations,
    };
  }, [preserveStructure]);

  const methods = useForm<SubstanceArticle>({
    resolver: zodResolver(substanceArticleSchema, undefined, { raw: true }) as never,
    defaultValues: getDefaultValues(article),
    mode: "onBlur",
  });

  const { control, watch, reset, getValues, register } = methods;

  const articleIdentifier = article?.id ?? article?.title ?? null;
  useEffect(() => {
    runWithoutMutate(() => {
      reset(getDefaultValues(article));
    });
  }, [articleIdentifier, reset, getDefaultValues, article, runWithoutMutate]);

  const dosageRoutes = useFieldArray({
    control,
    name: "dosage.routes",
  });

  const durationRoutes = useFieldArray({
    control,
    name: "duration.routes",
  });

  const sourceCitations = useFieldArray({
    control,
    name: "source_citations",
  });

  const references = useFieldArray({
    control,
    name: "references",
  });

  const citations = useFieldArray({
    control,
    name: "citations",
  });

  const comparisons = useFieldArray({
    control,
    name: "comparisons",
  });

  const historyCultureSections = useFieldArray({
    control,
    name: "history_culture.sections",
  });

  useEffect(() => {
    if (suppressClearSkipRef.current > 0) {
      suppressClearSkipRef.current -= 1;
      return;
    }
    suppressMutateRef.current = false;
  });

  useEffect(() => {
    const subscription = watch(() => {
      if (!suppressMutateRef.current) {
        onMutateRef.current?.();
      }
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const addDosageRoute = useCallback(() => {
    dosageRoutes.append(createEmptyDosageRoute());
    durationRoutes.append(createEmptyDurationRoute(), { shouldFocus: false });
  }, [dosageRoutes, durationRoutes]);

  const removeDosageRoute = useCallback(
    (index: number) => {
      dosageRoutes.remove(index);
      durationRoutes.remove(index);
    },
    [dosageRoutes, durationRoutes]
  );

  const moveDosageRoute = useCallback(
    (from: number, to: number) => {
      const count = dosageRoutes.fields.length;
      if (from === to || from < 0 || to < 0 || from >= count || to >= count) return;
      dosageRoutes.move(from, to);
      durationRoutes.move(from, to);
    },
    [dosageRoutes, durationRoutes]
  );

  const renameDosageRoute = useCallback(
    (index: number, name: string) => {
      if (!getValues(`dosage.routes.${index}`) || !getValues(`duration.routes.${index}`)) return;
      for (const path of [`dosage.routes.${index}.route`, `duration.routes.${index}.route`] as const) {
        void register(path).onChange({ target: { name: path, value: name }, type: "change" });
      }
    },
    [getValues, register],
  );

  const addSourceCitation = useCallback(() => {
    sourceCitations.append(createEmptyCitation());
  }, [sourceCitations]);

  const removeSourceCitation = useCallback(
    (index: number) => {
      sourceCitations.remove(index);
    },
    [sourceCitations]
  );

  const addReference = useCallback(() => {
    references.append(createEmptyReference());
  }, [references]);

  const removeReference = useCallback(
    (index: number) => {
      references.remove(index);
    },
    [references]
  );

  const addCitation = useCallback(() => {
    citations.append(createEmptyCitation());
  }, [citations]);

  const removeCitation = useCallback(
    (index: number) => {
      citations.remove(index);
    },
    [citations]
  );

  const addHistoryCultureSection = useCallback(() => {
    historyCultureSections.append(createEmptyHistoryCultureSection());
  }, [historyCultureSections]);

  const removeHistoryCultureSection = useCallback(
    (index: number) => {
      historyCultureSections.remove(index);
    },
    [historyCultureSections]
  );

  const applyDurationFromRoute = useCallback(
    (fromIndex: number, toIndex: number) => {
      const currentDurationRoutes = getValues("duration.routes");
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= currentDurationRoutes.length || toIndex >= currentDurationRoutes.length) {
        return;
      }

      const sourceStages = currentDurationRoutes[fromIndex]?.stages;
      if (!sourceStages) return;

      for (const stage of Object.keys(sourceStages) as Array<keyof typeof sourceStages>) {
        const path = `duration.routes.${toIndex}.stages.${stage}` as const;
        void register(path).onChange({
          target: { name: path, value: structuredClone(sourceStages[stage]) },
          type: "change",
        });
      }
    },
    [getValues, register]
  );

  const resetForm = useCallback(
    (nextArticle?: SubstanceArticle) => {
      runWithoutMutate(() => {
        reset(getDefaultValues(nextArticle));
      });
    },
    [reset, getDefaultValues, runWithoutMutate]
  );

  return {
    methods: methods as ArticleFormMethods,
    dosageRoutes,
    durationRoutes,
    references,
    sourceCitations,
    citations,
    comparisons,
    historyCultureSections,
    addDosageRoute,
    removeDosageRoute,
    moveDosageRoute,
    renameDosageRoute,
    addSourceCitation,
    removeSourceCitation,
    addReference,
    removeReference,
    addCitation,
    removeCitation,
    addHistoryCultureSection,
    removeHistoryCultureSection,
    applyDurationFromRoute,
    resetForm,
  };
}

export type { SubstanceArticle };

