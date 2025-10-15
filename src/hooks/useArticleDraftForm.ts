import { useCallback, useState, type ChangeEvent } from "react";

import {
  ArticleDraftForm,
  ArticleDraftStringField,
  CitationEntryForm,
  DoseRangeForm,
  DurationForm,
  DurationRoutePayload,
  DurationStagePayload,
  ToleranceForm,
  createEmptyArticleDraftForm,
  createEmptyCitationEntry,
  createEmptyDurationRouteEntry,
  createEmptyRouteEntry,
  ensureNormalizedTagList,
  joinNormalizedValues,
} from "../utils/articleDraftForm";
import { tokenizeTagString } from "../utils/tagDelimiters";

type MutationCallback = () => void;

type ReplaceFormOptions = {
  emitMutate?: boolean;
};

type UseArticleDraftFormOptions = {
  initialState?: ArticleDraftForm;
  onMutate?: MutationCallback;
};

type FieldChangeHandler = (
  field: ArticleDraftStringField,
) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;

type DurationChangeHandler = (
  field: keyof DurationForm,
) => (event: ChangeEvent<HTMLInputElement>) => void;

type DurationRouteStageChangeHandler = (
  index: number,
  field: keyof DurationStagePayload,
) => (event: ChangeEvent<HTMLInputElement>) => void;

type ToleranceChangeHandler = (
  field: keyof ToleranceForm,
) => (event: ChangeEvent<HTMLInputElement>) => void;

type RouteChangeHandler = (
  index: number,
  field: "route" | "units",
) => (event: ChangeEvent<HTMLInputElement>) => void;

type DoseRangeChangeHandler = (
  index: number,
  field: keyof DoseRangeForm,
) => (event: ChangeEvent<HTMLInputElement>) => void;

type CitationChangeHandler = (
  index: number,
  field: keyof CitationEntryForm,
) => (event: ChangeEvent<HTMLInputElement>) => void;

type TagField = "categories" | "chemicalClasses" | "psychoactiveClasses" | "mechanismEntries";

type TagFieldChangeHandler = (field: TagField) => (next: string[]) => void;

const splitLineTagInput = (value: string): string[] =>
  value
    .split(/\r?\n+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const splitDelimitedTagInput = (value: string): string[] =>
  tokenizeTagString(value, { splitOnComma: true, splitOnSlash: true });

const splitMechanismTagInput = (value: string): string[] =>
  tokenizeTagString(value, { splitOnComma: false, splitOnSlash: true });

const syncDurationRoutes = (
  routes: ArticleDraftForm["routes"],
  durationRoutes: DurationRoutePayload[],
): DurationRoutePayload[] => {
  if (routes.length === 0) {
    return durationRoutes.length > 0 ? durationRoutes : [createEmptyDurationRouteEntry()];
  }

  return routes.map((route, index) => {
    const existing = durationRoutes[index] ?? createEmptyDurationRouteEntry();
    const stages: DurationStagePayload = {
      total_duration: existing.stages?.total_duration ?? "",
      onset: existing.stages?.onset ?? "",
      peak: existing.stages?.peak ?? "",
      offset: existing.stages?.offset ?? "",
      after_effects: existing.stages?.after_effects ?? "",
    };

    const entry: DurationRoutePayload = {
      route: route.route,
      stages,
    };

    if (Array.isArray(existing.canonical_routes) && existing.canonical_routes.length > 0) {
      entry.canonical_routes = existing.canonical_routes;
    }

    return entry;
  });
};

export type ArticleDraftFormController = {
  form: ArticleDraftForm;
  handleFieldChange: FieldChangeHandler;
  handleTagFieldChange: TagFieldChangeHandler;
  handleDurationFieldChange: DurationChangeHandler;
  handleDurationRouteStageChange: DurationRouteStageChangeHandler;
  handleToleranceFieldChange: ToleranceChangeHandler;
  handleRouteFieldChange: RouteChangeHandler;
  handleDoseRangeFieldChange: DoseRangeChangeHandler;
  addRouteEntry: () => void;
  removeRouteEntry: (index: number) => void;
  applyDurationDefaultsToRoute: (index: number) => void;
  handleCitationFieldChange: CitationChangeHandler;
  addCitationEntry: () => void;
  removeCitationEntry: (index: number) => void;
  resetForm: () => void;
  replaceForm: (nextState: ArticleDraftForm, options?: ReplaceFormOptions) => void;
};

export const useArticleDraftForm = ({
  initialState = createEmptyArticleDraftForm(),
  onMutate,
}: UseArticleDraftFormOptions = {}): ArticleDraftFormController => {
  const [form, setForm] = useState<ArticleDraftForm>(() => ({
    ...initialState,
    durationRoutes: syncDurationRoutes(initialState.routes, initialState.durationRoutes),
  }));

  const runMutation = useCallback(() => {
    if (onMutate) {
      onMutate();
    }
  }, [onMutate]);

  const replaceForm = useCallback(
    (nextState: ArticleDraftForm, options?: ReplaceFormOptions) => {
      if (options?.emitMutate ?? true) {
        runMutation();
      }
      setForm({
        ...nextState,
        durationRoutes: syncDurationRoutes(nextState.routes, nextState.durationRoutes),
      });
    },
    [runMutation],
  );

  const handleFieldChange: FieldChangeHandler = useCallback(
    (field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => {
        if (field === "categoriesInput") {
          const normalized = ensureNormalizedTagList(splitLineTagInput(value));
          return {
            ...previous,
            categoriesInput: value,
            categories: normalized,
          };
        }

        if (field === "chemicalClass") {
          const normalized = ensureNormalizedTagList(splitDelimitedTagInput(value));
          return {
            ...previous,
            chemicalClass: value,
            chemicalClasses: normalized,
          };
        }

        if (field === "psychoactiveClass") {
          const normalized = ensureNormalizedTagList(splitDelimitedTagInput(value));
          return {
            ...previous,
            psychoactiveClass: value,
            psychoactiveClasses: normalized,
          };
        }

        if (field === "mechanismOfAction") {
          const normalized = ensureNormalizedTagList(splitMechanismTagInput(value));
          return {
            ...previous,
            mechanismOfAction: value,
            mechanismEntries: normalized,
          };
        }

        return {
          ...previous,
          [field]: value,
        };
      });
    },
    [runMutation],
  );

  const handleTagFieldChange: TagFieldChangeHandler = useCallback(
    (field) => (nextValues) => {
      runMutation();
      setForm((previous) => {
        const normalized = ensureNormalizedTagList(nextValues);

        if (field === "categories") {
          return {
            ...previous,
            categories: normalized,
            categoriesInput: normalized.join("\n"),
          };
        }

        if (field === "chemicalClasses") {
          return {
            ...previous,
            chemicalClasses: normalized,
            chemicalClass: joinNormalizedValues(normalized, "; "),
          };
        }

        if (field === "psychoactiveClasses") {
          return {
            ...previous,
            psychoactiveClasses: normalized,
            psychoactiveClass: joinNormalizedValues(normalized, "; "),
          };
        }

        return {
          ...previous,
          mechanismEntries: normalized,
          mechanismOfAction: joinNormalizedValues(normalized, "; "),
        };
      });
    },
    [runMutation],
  );

  const handleDurationFieldChange: DurationChangeHandler = useCallback(
    (field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => ({
        ...previous,
        duration: {
          ...previous.duration,
          [field]: value,
        },
      }));
    },
    [runMutation],
  );

  const handleDurationRouteStageChange: DurationRouteStageChangeHandler = useCallback(
    (index, field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => {
        const synchronized = syncDurationRoutes(previous.routes, previous.durationRoutes);
        if (index >= synchronized.length) {
          return {
            ...previous,
            durationRoutes: synchronized,
          };
        }

        const nextDurationRoutes = synchronized.map((entry, routeIndex) =>
          routeIndex === index
            ? {
                ...entry,
                stages: {
                  ...entry.stages,
                  [field]: value,
                },
              }
            : entry,
        );

        return {
          ...previous,
          durationRoutes: nextDurationRoutes,
        };
      });
    },
    [runMutation],
  );

  const applyDurationDefaultsToRoute = useCallback(
    (index: number) => {
      runMutation();
      setForm((previous) => {
        const synchronized = syncDurationRoutes(previous.routes, previous.durationRoutes);
        if (index >= synchronized.length) {
          return {
            ...previous,
            durationRoutes: synchronized,
          };
        }

        const defaults = previous.duration;
        const stageDefaults: DurationStagePayload = {
          total_duration: defaults.totalDuration.trim(),
          onset: defaults.onset.trim(),
          peak: defaults.peak.trim(),
          offset: defaults.offset.trim(),
          after_effects: defaults.afterEffects.trim(),
        };

        const nextDurationRoutes = synchronized.map((entry, routeIndex) =>
          routeIndex === index
            ? {
                ...entry,
                stages: stageDefaults,
              }
            : entry,
        );

        return {
          ...previous,
          durationRoutes: nextDurationRoutes,
        };
      });
    },
    [runMutation],
  );

  const handleToleranceFieldChange: ToleranceChangeHandler = useCallback(
    (field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => ({
        ...previous,
        tolerance: {
          ...previous.tolerance,
          [field]: value,
        },
      }));
    },
    [runMutation],
  );

  const handleRouteFieldChange: RouteChangeHandler = useCallback(
    (index, field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => {
        const nextRoutes = previous.routes.map((route, routeIndex) =>
          routeIndex === index
            ? {
                ...route,
                [field]: value,
              }
            : route,
        );

        return {
          ...previous,
          routes: nextRoutes,
          durationRoutes: syncDurationRoutes(nextRoutes, previous.durationRoutes),
        };
      });
    },
    [runMutation],
  );

  const handleDoseRangeFieldChange: DoseRangeChangeHandler = useCallback(
    (index, field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => ({
        ...previous,
        routes: previous.routes.map((route, routeIndex) =>
          routeIndex === index
            ? {
                ...route,
                doseRanges: {
                  ...route.doseRanges,
                  [field]: value,
                },
              }
            : route,
        ),
      }));
    },
    [runMutation],
  );

  const addRouteEntry = useCallback(() => {
    runMutation();
    setForm((previous) => {
      const nextRoutes = [...previous.routes, createEmptyRouteEntry()];
      return {
        ...previous,
        routes: nextRoutes,
        durationRoutes: syncDurationRoutes(nextRoutes, previous.durationRoutes),
      };
    });
  }, [runMutation]);

  const removeRouteEntry = useCallback(
    (index) => {
      runMutation();
      setForm((previous) => {
        if (previous.routes.length <= 1) {
          return {
            ...previous,
            routes: [createEmptyRouteEntry()],
            durationRoutes: [createEmptyDurationRouteEntry()],
          };
        }

        const nextRoutes = previous.routes.filter((_, routeIndex) => routeIndex !== index);
        const nextDurationRoutes = previous.durationRoutes.filter(
          (_, routeIndex) => routeIndex !== index,
        );

        return {
          ...previous,
          routes: nextRoutes,
          durationRoutes: syncDurationRoutes(nextRoutes, nextDurationRoutes),
        };
      });
    },
    [runMutation],
  );

  const handleCitationFieldChange: CitationChangeHandler = useCallback(
    (index, field) => (event) => {
      const value = event.target.value;
      runMutation();
      setForm((previous) => ({
        ...previous,
        citations: previous.citations.map((citation, citationIndex) =>
          citationIndex === index
            ? {
                ...citation,
                [field]: value,
              }
            : citation,
        ),
      }));
    },
    [runMutation],
  );

  const addCitationEntry = useCallback(() => {
    runMutation();
    setForm((previous) => ({
      ...previous,
      citations: [...previous.citations, createEmptyCitationEntry()],
    }));
  }, [runMutation]);

  const removeCitationEntry = useCallback(
    (index) => {
      runMutation();
      setForm((previous) => {
        if (previous.citations.length <= 1) {
          return {
            ...previous,
            citations: [createEmptyCitationEntry()],
          };
        }

        return {
          ...previous,
          citations: previous.citations.filter((_, citationIndex) => citationIndex !== index),
        };
      });
    },
    [runMutation],
  );

  const resetForm = useCallback(() => {
    replaceForm(createEmptyArticleDraftForm());
  }, [replaceForm]);

  return {
    form,
    handleFieldChange,
    handleTagFieldChange,
    handleDurationFieldChange,
    handleDurationRouteStageChange,
    handleToleranceFieldChange,
    handleRouteFieldChange,
    handleDoseRangeFieldChange,
    addRouteEntry,
    removeRouteEntry,
    applyDurationDefaultsToRoute,
    handleCitationFieldChange,
    addCitationEntry,
    removeCitationEntry,
    resetForm,
    replaceForm,
  };
};
