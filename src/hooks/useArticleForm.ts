/**
 * React Hook Form-based article form hook.
 * Replaces useArticleDraftForm with RHF + Zod validation.
 */

import { useCallback, useEffect, useRef } from "react";
import { useForm, useFieldArray, type UseFormReturn, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { substanceArticleSchema, type SubstanceArticle } from "../schema";
import { createEmptyArticle } from "../data/schema";

// Default empty route structures
const createEmptyDosageRoute = () => ({
  route: "",
  bioavailability: "",
  dose_ranges: {
    threshold: { min: null, max: null, unit: "" },
    light: { min: null, max: null, unit: "" },
    moderate: { min: null, max: null, unit: "" },
    strong: { min: null, max: null, unit: "" },
    heavy: { min: null, max: null, unit: "" },
  },
  notes: "",
});

const createEmptyDurationRoute = () => ({
  route: "",
  stages: {
    onset: { min: null, max: null, unit: "" },
    come_up: { min: null, max: null, unit: "" },
    peak: { min: null, max: null, unit: "" },
    offset: { min: null, max: null, unit: "" },
    after_effects: { min: null, max: null, unit: "" },
    total_duration: { min: null, max: null, unit: "" },
  },
});

const createEmptyCitation = () => ({
  name: "",
  url: "",
});

const createEmptyHistoryCultureSection = () => ({
  heading: "",
  content: "",
});

export type ArticleFormMethods = UseFormReturn<SubstanceArticle>;

export type UseArticleFormOptions = {
  article?: SubstanceArticle;
  onMutate?: () => void;
};

export type UseArticleFormReturn = {
  methods: ArticleFormMethods;
  // Field arrays
  dosageRoutes: ReturnType<typeof useFieldArray<SubstanceArticle, "dosage.routes">>;
  durationRoutes: ReturnType<typeof useFieldArray<SubstanceArticle, "duration.routes">>;
  sourceCitations: ReturnType<typeof useFieldArray<SubstanceArticle, "source_citations">>;
  citations: ReturnType<typeof useFieldArray<SubstanceArticle, "citations">>;
  comparisons: ReturnType<typeof useFieldArray<SubstanceArticle, "comparisons">>;
  historyCultureSections: ReturnType<typeof useFieldArray<SubstanceArticle, "history_culture.sections">>;
  // Helpers
  addDosageRoute: () => void;
  removeDosageRoute: (index: number) => void;
  addSourceCitation: () => void;
  removeSourceCitation: (index: number) => void;
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
}: UseArticleFormOptions = {}): UseArticleFormReturn {
  const onMutateRef = useRef(onMutate);
  onMutateRef.current = onMutate;

  // Ensure article has at least one route and citation for form editing
  const getDefaultValues = useCallback((source?: SubstanceArticle): SubstanceArticle => {
    const base = source ?? createEmptyArticle();
    const empty = createEmptyArticle();
    return {
      ...base,
      dosage: {
        ...base.dosage,
        routes: base.dosage.routes.length > 0 ? base.dosage.routes : [createEmptyDosageRoute()],
      },
      duration: {
        ...base.duration,
        routes: base.duration.routes.length > 0 ? base.duration.routes : [createEmptyDurationRoute()],
      },
      // Ensure history_culture has default values for form editing (optional field)
      history_culture: base.history_culture ?? empty.history_culture,
      citations: base.citations.length > 0 ? base.citations : [createEmptyCitation()],
    };
  }, []);

  const methods = useForm<SubstanceArticle>({
    resolver: zodResolver(substanceArticleSchema),
    defaultValues: getDefaultValues(article),
    mode: "onBlur",
  });

  const { control, watch, reset, getValues } = methods;

  // Reset form when article prop changes (detected via id or title)
  const articleIdentifier = article?.id ?? article?.title ?? null;
  useEffect(() => {
    reset(getDefaultValues(article));
  }, [articleIdentifier, reset, getDefaultValues, article]);

  // Field arrays for complex nested structures
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

  // Sync duration routes when dosage routes change
  const watchedDosageRoutes = watch("dosage.routes");

  useEffect(() => {
    if (!watchedDosageRoutes) return;

    const currentDurationRoutes = getValues("duration.routes");

    // Only sync if lengths differ or route names differ
    const needsSync =
      watchedDosageRoutes.length !== currentDurationRoutes.length ||
      watchedDosageRoutes.some(
        (dr, i) => dr.route !== currentDurationRoutes[i]?.route
      );

    if (needsSync) {
      const synced = watchedDosageRoutes.map((dosageRoute, index) => ({
        route: dosageRoute.route,
        stages: currentDurationRoutes[index]?.stages ?? createEmptyDurationRoute().stages,
      }));
      durationRoutes.replace(synced);
    }
  }, [
    watchedDosageRoutes?.length,
    watchedDosageRoutes?.map((r) => r.route).join(","),
    durationRoutes,
    getValues,
  ]);

  // Mutation tracking - call onMutate when form changes
  useEffect(() => {
    const subscription = watch(() => {
      onMutateRef.current?.();
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  // Helpers
  const addDosageRoute = useCallback(() => {
    dosageRoutes.append(createEmptyDosageRoute());
  }, [dosageRoutes]);

  const removeDosageRoute = useCallback(
    (index: number) => {
      if (dosageRoutes.fields.length <= 1) {
        // Replace with empty instead of removing last one
        dosageRoutes.replace([createEmptyDosageRoute()]);
        durationRoutes.replace([createEmptyDurationRoute()]);
      } else {
        dosageRoutes.remove(index);
        durationRoutes.remove(index);
      }
    },
    [dosageRoutes, durationRoutes]
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

  const addCitation = useCallback(() => {
    citations.append(createEmptyCitation());
  }, [citations]);

  const removeCitation = useCallback(
    (index: number) => {
      if (citations.fields.length <= 1) {
        citations.replace([createEmptyCitation()]);
      } else {
        citations.remove(index);
      }
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
      if (fromIndex >= currentDurationRoutes.length || toIndex >= currentDurationRoutes.length) {
        return;
      }

      const sourceStages = currentDurationRoutes[fromIndex]?.stages;
      if (!sourceStages) return;

      const updated = currentDurationRoutes.map((route, index) =>
        index === toIndex
          ? { ...route, stages: { ...sourceStages } }
          : route
      );
      durationRoutes.replace(updated);
    },
    [durationRoutes, getValues]
  );

  const resetForm = useCallback(
    (nextArticle?: SubstanceArticle) => {
      reset(getDefaultValues(nextArticle));
    },
    [reset, getDefaultValues]
  );

  return {
    methods,
    dosageRoutes,
    durationRoutes,
    sourceCitations,
    citations,
    comparisons,
    historyCultureSections,
    addDosageRoute,
    removeDosageRoute,
    addSourceCitation,
    removeSourceCitation,
    addCitation,
    removeCitation,
    addHistoryCultureSection,
    removeHistoryCultureSection,
    applyDurationFromRoute,
    resetForm,
  };
}

// Re-export types for convenience
export type { SubstanceArticle };
export type ArticleFieldPath = FieldPath<SubstanceArticle>;
